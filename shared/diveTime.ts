import type { ImportedDive, TripConfig } from './model';

export function validTimeZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(); return !!zone.trim(); } catch { return false; }
}
export function zoneOffset(instant: string, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const p = Object.fromEntries(parts.map(v => [v.type, v.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(Date.parse(instant) / 1000) * 1000) / 60000);
}
export function diveZone(dive: ImportedDive, config: TripConfig): string | undefined {
  return dive.timeZoneOverride || config.timeZoneOverride || dive.enrichment?.timeZone || config.destinationTimeZone;
}
// A CSV wall clock is interpreted once in the resolved zone. The imported instant remains untouched.
export function diveInstant(dive: ImportedDive, config: TripConfig): string {
  const zone = diveZone(dive, config);
  if (!zone || !dive.sourceLocalTime) return dive.startTime;
  try {
    const wall = Date.parse(dive.sourceLocalTime + 'Z');
    let value = wall;
    for (let i = 0; i < 4; i++) value = wall - zoneOffset(new Date(value).toISOString(), zone) * 60000;
    // A nonexistent DST wall time is left on the original import offset for manual review.
    if (value + zoneOffset(new Date(value).toISOString(), zone) * 60000 !== wall) return dive.startTime;
    return new Date(value).toISOString();
  } catch { return dive.startTime; }
}
export function diveOffset(dive: ImportedDive, config: TripConfig): number {
  const zone = diveZone(dive, config);
  try { return zone ? zoneOffset(diveInstant(dive, config), zone) : config.utcOffsetMinutes; } catch { return config.utcOffsetMinutes; }
}
export function diveLocalTime(dive: ImportedDive, config: TripConfig): string {
  return new Date(Date.parse(diveInstant(dive, config)) + diveOffset(dive, config) * 60000).toISOString().slice(0, 19).replace('T', ' ');
}
