import { Coordinates, Dive, Enrichment, GarminStats, LocationCandidate, Trip } from './model';
import { diveInstant, validTimeZone } from './diveTime';

export function coordinates(latitude: unknown, longitude: unknown): Coordinates | undefined {
  return typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : undefined;
}
export function diveCoordinates(stats?: GarminStats): Coordinates | undefined {
  return coordinates(stats?.entryLatitude, stats?.entryLongitude) ?? coordinates(stats?.exitLatitude, stats?.exitLongitude) ?? coordinates(stats?.latitude, stats?.longitude);
}
export function lookupCoordinates(dive: Dive, trip: Trip): { point?: Coordinates; fallback: boolean } {
  const own = diveCoordinates(dive.garminStats);
  if (own) return { point: own, fallback: false };
  const nearest = trip.dives.filter(d => diveCoordinates(d.garminStats)).sort((a, b) => Math.abs(Date.parse(a.startTime) - Date.parse(dive.startTime)) - Math.abs(Date.parse(b.startTime) - Date.parse(dive.startTime)) || a.id.localeCompare(b.id))[0];
  return { point: diveCoordinates(nearest?.garminStats), fallback: true };
}
export function distance(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180, x = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
type Element = { id?: number; tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number }; geometry?: { lat: number; lon: number }[]; members?: { geometry?: { lat: number; lon: number }[]; role?: string }[] };
function boundaryDistance(point: Coordinates, geometry: { lat: number; lon: number }[]): number {
  if (!geometry.length) return Infinity;
  const ring = geometry.length > 3 && geometry[0].lat === geometry[geometry.length - 1].lat && geometry[0].lon === geometry[geometry.length - 1].lon;
  let inside = false, nearest = Infinity;
  const scale = Math.cos(point.latitude * Math.PI / 180);
  for (let i = 0, j = geometry.length - 1; i < geometry.length; j = i++) {
    const a = geometry[j], b = geometry[i];
    if (ring && (a.lat > point.latitude) !== (b.lat > point.latitude) && point.longitude < (b.lon - a.lon) * (point.latitude - a.lat) / (b.lat - a.lat) + a.lon) inside = !inside;
    if (i === 0 && !ring) continue;
    const ax = (a.lon - point.longitude) * scale, ay = a.lat - point.latitude, bx = (b.lon - point.longitude) * scale, by = b.lat - point.latitude;
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy) * 111195);
  }
  return inside ? 0 : nearest;
}
export function locationCandidates(point: Coordinates, elements: Element[], broadOnly = false): LocationCandidate[] {
  const found: LocationCandidate[] = [];
  for (const e of elements) {
    const t = e.tags || {}, name = t.name || t['name:en'];
    if (!name || t.shop || t.office || t.amenity === 'dive_centre' || t.leisure === 'sports_centre' || t.scuba_diving === 'school' || t.scuba_diving === 'centre' || t.scuba_diving === 'center' || /div(e|ing)\s+(shop|cent(re|er)|school)/i.test(name)) continue;
    const site = t.sport === 'scuba_diving' || t.scuba_diving === 'site';
    const kind = site ? 'dive site' : t.natural || t.place || '';
    if (!site && !['reef', 'beach', 'bay', 'cove', 'island', 'islet', 'archipelago', 'sea', 'ocean', 'region', 'town', 'village', 'city'].includes(kind)) continue;
    const broad = ['bay', 'cove', 'island', 'archipelago', 'sea', 'ocean', 'region', 'town', 'village', 'city'].includes(kind);
    if (broadOnly && !broad) continue;
    const center = coordinates(e.lat ?? e.center?.lat, e.lon ?? e.center?.lon);
    const geometries = [e.geometry, ...(e.members || []).filter(m => m.role !== 'inner').map(m => m.geometry)].filter((g): g is { lat: number; lon: number }[] => !!g?.length);
    const meters = geometries.length ? Math.min(...geometries.map(g => boundaryDistance(point, g))) : center ? distance(point, center) : Infinity;
    const limit = site ? 500 : broad ? 15000 : 2000;
    if (meters <= limit) found.push({ name, kind, distanceM: Math.round(meters), broad });
  }
  const priority = (c: LocationCandidate) => (c.kind === 'dive site' ? 0 : c.broad ? 2000 : 750) + c.distanceM;
  return found.sort((a, b) => priority(a) - priority(b)).filter((c, i, all) => all.findIndex(x => x.name === c.name) === i).slice(0, 4);
}
export function clearLocation(candidates: LocationCandidate[]): string | undefined {
  const first = candidates[0], next = candidates[1];
  if (!first) return undefined;
  if (!next || first.kind !== next.kind || next.distanceM - first.distanceM > 150) return first.name;
  return undefined;
}
export function weatherTemperature(data: any, instant: string): { airTempC: number; weatherHour: string } | undefined {
  if (data?.hourly_units?.temperature_2m !== '°C' || !Array.isArray(data?.hourly?.time) || !Array.isArray(data?.hourly?.temperature_2m)) return;
  const hour = Math.floor(Date.parse(instant) / 3600000) * 3600;
  const index = data.hourly.time.findIndex((time: unknown) => typeof time === 'number' && time === hour);
  const temperature = data.hourly.temperature_2m[index];
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < -100 || temperature > 70) return;
  return { airTempC: Math.round(temperature * 10) / 10, weatherHour: new Date(hour * 1000).toISOString() };
}
export interface EnrichmentProviders {
  geographicNames?: (point: Coordinates) => Promise<LocationCandidate[]>;
  destination: (name: string) => Promise<(Coordinates & { timeZone?: string }) | undefined>;
  locations: (points: Coordinates[]) => Promise<Element[]>;
  zone: (point: Coordinates) => Promise<string | undefined>;
  weather: (point: Coordinates, date: string) => Promise<unknown>;
}
export function enrichmentKey(trip: Trip): string {
  return JSON.stringify([3, trip.dives.map(d => [d.id, d.timeZoneOverride, diveCoordinates(d.garminStats)]), trip.config]);
}
// Each provider fails independently. Results are applied to the latest trip, never a stale snapshot.
export async function enrichTrip(trip: Trip, providers: EnrichmentProviders): Promise<Map<string, Enrichment>> {
  const contexts = trip.dives.map(dive => ({ dive, ...lookupCoordinates(dive, trip) }));
  const result = new Map<string, Enrichment>();
  if (!contexts.some(c => c.point) && (trip.config.destinationCoordinates || trip.config.destination?.trim())) {
    try { const destination = trip.config.destinationCoordinates ?? await providers.destination(trip.config.destination!.trim()); if (destination) for (const c of contexts) c.point = coordinates(destination.latitude, destination.longitude); } catch { /* Retried below on next lookup. */ }
  }
  const pointKey = (p: Coordinates) => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
  const points = [...new Map(contexts.filter(c => c.point).map(c => [pointKey(c.point!), c.point!])).values()];
  const geographic = new Map<string, LocationCandidate[]>();
  for (const point of points) {
    try { geographic.set(pointKey(point), await providers.geographicNames?.(point) || []); }
    catch { geographic.set(pointKey(point), []); }
  }
  const forContext = (point: Coordinates, fallback: boolean) => (geographic.get(pointKey(point)) || []).filter(c => !fallback || c.broad).slice(0, 4);
  // A working GeoNames result does not wait on public Overpass servers.
  const unresolved = points.filter(p => contexts.some(c => c.point && pointKey(c.point) === pointKey(p) && !clearLocation(forContext(p, c.fallback))));
  let elements: Element[] = [];
  try { if (unresolved.length) elements = await providers.locations(unresolved); } catch { /* Keep GeoNames candidates and retry unresolved locations later. */ }
  const zones = new Map<string, string | undefined>(), weather = new Map<string, unknown>();
  for (const { dive, point, fallback } of contexts) {
    const errors: string[] = [];
    const oldPoint = dive.enrichment?.coordinates;
    const old = point && oldPoint && pointKey(point) === pointKey(oldPoint) ? dive.enrichment || {} : {};
    if (!point) { result.set(dive.id, { ...old, errors: ['No GPS. Enter a destination in Trip Settings when the entire trip has no GPS.'] }); continue; }
    const key = pointKey(point);
    if (!zones.has(key)) { try { const zone = await providers.zone(point); zones.set(key, zone && validTimeZone(zone) ? zone : undefined); } catch { zones.set(key, undefined); } }
    const timeZone = zones.get(key) || old.timeZone;
    if (!timeZone) errors.push('Time zone unavailable. Keeping the trip offset; retry or correct manually.');
    const names = forContext(point, fallback);
    const osm = locationCandidates(point, elements, fallback);
    const candidates = clearLocation(names) ? names : osm.length ? osm : names;
    const locationName = clearLocation(candidates);
    if (!locationName) errors.push(candidates.length ? 'Choose a location candidate or edit the name.' : 'Location unavailable; retry or enter a name.');
    const next: Enrichment = { ...old, coordinates: point, fallback, timeZone, candidates, locationName: locationName || old.locationName, checkedAt: new Date().toISOString(), errors };
    const instant = diveInstant({ ...dive, enrichment: next }, trip.config), date = instant.slice(0, 10), weatherKey = `${key}:${date}`;
    if (!weather.has(weatherKey)) { try { weather.set(weatherKey, await providers.weather(point, date)); } catch { weather.set(weatherKey, undefined); } }
    const temperature = weatherTemperature(weather.get(weatherKey), instant);
    if (temperature) Object.assign(next, temperature);
    else {
      if (next.weatherHour !== new Date(Math.floor(Date.parse(instant) / 3600000) * 3600000).toISOString()) { delete next.airTempC; delete next.weatherHour; }
      errors.push('Historical air temperature unavailable; retry later or enter it manually.');
    }
    result.set(dive.id, next);
  }
  return result;
}
export function applyEnrichment(trip: Trip, results: Map<string, Enrichment>): Trip {
  return { ...trip, enrichmentKey: enrichmentKey(trip), dives: trip.dives.map(d => results.has(d.id) ? { ...d, enrichment: results.get(d.id) } : d), updatedAt: new Date().toISOString() };
}
