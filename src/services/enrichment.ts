import { Coordinates, Enrichment, Trip } from '../../shared/model';
import { enrichTrip, EnrichmentProviders } from '../../shared/enrichment';
import { geoNamesCandidates, geoNamesFeatures } from '../../shared/geonames';
import { getGeoNamesUsername } from './geoNamesSettings';

const cache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
async function json(url: string, init?: RequestInit): Promise<any> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
  try { const response = await fetch(url, { ...init, signal: controller.signal }); if (!response.ok) throw new Error(`Lookup unavailable (${response.status}).`); return await response.json(); }
  finally { clearTimeout(timer); }
}
async function cached(key: string, work: () => Promise<any>, ttl = 86400000): Promise<any> {
  const hit = cache.get(key); if (hit && hit.expires > Date.now()) return hit.value;
  const pending = inflight.get(key);
  if (pending) return pending;
  const task = work(); inflight.set(key, task);
  let value: unknown;
  try { value = await task; } finally { inflight.delete(key); }
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  cache.set(key, { value, expires: Date.now() + ttl }); return value;
}
let lastOverpass = 0;
let overpassQueue: Promise<unknown> = Promise.resolve();
const pointKey = (p: Coordinates) => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
export async function searchDestinations(name: string): Promise<Array<Coordinates & { name: string; timeZone?: string }>> {
  if (!name.trim()) return [];
  const data = await cached(`destinations:${name}`, () => json(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=5&language=en&format=json`));
  return (data.results || []).map((p: any) => ({ latitude: p.latitude, longitude: p.longitude, name: [p.name, p.admin1, p.country].filter(Boolean).join(', '), timeZone: p.timezone }));
}
export const providers: EnrichmentProviders = {
  geographicNames: async p => {
    const username = await getGeoNamesUsername();
    if (!username) return [];
    return cached(`geonames:${username}:${pointKey(p)}`, async () => {
      const features = Object.keys(geoNamesFeatures).map(code => `featureCode=${code}`).join('&');
      const data = await json(`https://secure.geonames.org/findNearbyJSON?lat=${p.latitude}&lng=${p.longitude}&radius=15&maxRows=40&${features}&username=${encodeURIComponent(username)}`);
      return geoNamesCandidates(p, data);
    });
  },
  destination: name => cached(`destination:${name}`, async () => {
    const results = await searchDestinations(name);
    // Avoid silently choosing between equally named destinations.
    if (results.length !== 1) throw new Error('Destination is ambiguous. Choose a destination in Trip Settings.');
    return results[0];
  }),
  locations: async points => {
    const all: any[] = [];
    // Nearby dives share a 15 km query; names are ranked against the actual dive GPS.
    const groups = new Map<string, Coordinates>();
    for (const p of points) {
      const latitude = Math.round(p.latitude * 20) / 20, longitude = Math.round(p.longitude * 20) / 20;
      groups.set(`${latitude.toFixed(2)},${longitude.toFixed(2)}`, { latitude, longitude });
    }
    const entries = [...groups.entries()];
    for (let i = 0; i < entries.length; i += 8) {
      const batch = entries.slice(i, i + 8);
      const key = `osm:${batch.map(([k]) => k).sort().join('|')}`;
      const elements = await cached(key, () => {
        const task = overpassQueue.catch(() => undefined).then(async () => {
          const delay = Math.max(0, 30000 - (Date.now() - lastOverpass));
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          lastOverpass = Date.now();
          const query = `[out:json][timeout:20];(${batch.map(([, p]) => {
            const area = `(around:19000,${p.latitude},${p.longitude})`;
            return `nwr${area}[name][sport=scuba_diving];nwr${area}[name][scuba_diving=site];nwr${area}[name][natural~"^(reef|beach|bay|cove|strait|sea)$"];nwr${area}[name][place~"^(island|islet|archipelago|sea|ocean|region|town|village|city)$"];`;
          }).join('')});out center geom;`;
          let failure: unknown;
          for (const endpoint of ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
            try {
              const data = await json(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DiveLogTransfer/0.4 (Android; personal dive log)', 'Accept': 'application/json' }, body: `data=${encodeURIComponent(query)}` });
              if (!Array.isArray(data.elements) || data.remark) throw new Error('Incomplete OSM response.');
              return data.elements;
            } catch (error) {
              // Respect service throttling; the automatic retry uses backoff.
              if (error instanceof Error && /\((406|429)\)/.test(error.message)) throw error;
              failure = error;
            }
          }
          throw failure;
        });
        overpassQueue = task; return task;
      });
      all.push(...elements);
    }
    return all;
  },
  zone: p => cached(`zone:${pointKey(p)}`, async () => {
    const data = await json(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&timezone=auto&forecast_days=1`);
    return data.timezone;
  }),
  weather: (p, date) => cached(`weather:${pointKey(p)}:${date}`, async () => {
    const age = (Date.now() - Date.parse(date + 'T00:00:00Z')) / 86400000;
    if (age < 0) throw new Error('The dive date is in the future.');
    const endpoint = age < 6 ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive';
    return json(`${endpoint}?latitude=${p.latitude}&longitude=${p.longitude}&start_date=${date}&end_date=${date}&hourly=temperature_2m&temperature_unit=celsius&timezone=GMT&timeformat=unixtime`);
  }, 3600000)
};
export async function lookupTrip(trip: Trip): Promise<Map<string, Enrichment>> { return enrichTrip(trip, providers); }

// Optional server proxy keeps Google credentials off the phone. These names stay in memory only.
export async function googleFallback(point: Coordinates, broadOnly = false): Promise<string[]> {
  const endpoint = process.env.EXPO_PUBLIC_GOOGLE_LOCATION_PROXY;
  if (!endpoint || !endpoint.startsWith('https://')) return [];
  const data = await json(`${endpoint}?latitude=${point.latitude}&longitude=${point.longitude}&broadOnly=${broadOnly ? 1 : 0}`);
  return Array.isArray(data.names) ? data.names.filter((v: unknown): v is string => typeof v === 'string').slice(0, 4) : [];
}
