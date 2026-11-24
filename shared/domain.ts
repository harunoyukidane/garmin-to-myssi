import { Dive, EditableField, ImportedDive, ImportReport, Measurements, SequencedDive, Trip, TripConfig, newId } from './model';
import { diveInstant, diveLocalTime, validTimeZone } from './diveTime';

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateConfig(config: TripConfig): string[] {
  const errors: string[] = [];
  if (!validDate(config.tripStartDate) || !validDate(config.tripEndDate)) errors.push('Enter real dates as YYYY-MM-DD.');
  if (config.tripStartDate > config.tripEndDate) errors.push('End date must be on or after start date.');
  if (config.timeZoneOverride && !validTimeZone(config.timeZoneOverride)) errors.push('Enter a valid geographic time zone, such as Asia/Singapore.');
  if (config.destinationTimeZone && !validTimeZone(config.destinationTimeZone)) errors.push('Select a destination with a valid time zone.');
  if (!Number.isInteger(config.utcOffsetMinutes) || config.utcOffsetMinutes < -720 || config.utcOffsetMinutes > 840) errors.push('UTC offset must be whole minutes from -720 to 840.');
  return errors;
}
export function offsetLabel(minutes: number): string {
  return `UTC${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
}
export function effective(dive: Dive): Dive {
  const result = { ...dive, ...dive.original, locationName: dive.original.locationName || dive.enrichment?.locationName };
  for (const field of Object.keys(dive.corrections) as EditableField[]) {
    const value = dive.corrections[field];
    (result as unknown as Record<string, unknown>)[field] = value === null ? undefined : value;
  }
  return result;
}
export function inTrip(dive: ImportedDive, config: TripConfig): boolean {
  const date = diveLocalTime(dive, config).slice(0, 10);
  return date >= config.tripStartDate && date <= config.tripEndDate;
}
export function tripDives(trip: Trip): SequencedDive[] {
  return trip.dives.filter(d => inTrip(d, trip.config)).sort((a, b) => Date.parse(diveInstant(a, trip.config)) - Date.parse(diveInstant(b, trip.config)) || a.id.localeCompare(b.id))
    .map((dive, index) => ({ ...effective(dive), sequence: index + 1 }));
}
export function measurements(d: ImportedDive): Measurements {
  return { durationSec: d.durationSec, maxDepthM: d.maxDepthM, waterTempC: d.waterTempC, maxWaterTempC: d.maxWaterTempC, locationName: d.locationName, notes: d.notes };
}
function sameMeasurements(a: Measurements, b: Measurements): boolean {
  return a.durationSec === b.durationSec && a.maxDepthM === b.maxDepthM && a.waterTempC === b.waterTempC;
}
function sameSourceValues(existing: Dive, incoming: ImportedDive): boolean {
  const fields = ['durationSec', 'maxDepthM', 'waterTempC', 'maxWaterTempC', 'locationName', 'notes'] as const;
  if (fields.some(field => existing.original[field] !== incoming[field])) return false;
  const a = existing.garminStats || {}, b = incoming.garminStats || {};
  return Object.keys({ ...a, ...b }).every(key => a[key as keyof typeof a] === b[key as keyof typeof b]);
}
export function mergeDives(trip: Trip, records: ImportedDive[], fileId: string, report: ImportReport, allowSameTime = false): Trip {
  const dives = [...trip.dives];
  for (const record of records) {
    if (!Number.isFinite(Date.parse(record.startTime))) { report.failures.push('Invalid dive start time.'); continue; }
    const byId = record.garmin ? dives.find(d => d.garmin?.accountId === record.garmin!.accountId && d.garmin?.activityId === record.garmin!.activityId && d.garmin?.diveId === record.garmin!.diveId)
      : record.sourceId && dives.find(d => d.sourceId === record.sourceId);
    const atTime = dives.filter(d => d.startTime === record.startTime);
    if (byId) {
      if (byId.startTime !== record.startTime || (byId.diveKind || 'scuba') !== (record.diveKind || 'scuba') || !sameSourceValues(byId, record)) report.conflicts.push(`Activity ${record.garmin?.activityId || record.sourceId} has different imported values; existing dive kept. Review the original source before making corrections.`);
      else report.duplicates++;
      continue;
    }
    const equivalent = atTime.find(d => (d.diveKind || 'scuba') === (record.diveKind || 'scuba') && sameMeasurements(d.original, record));
    if (equivalent) { report.duplicates++; continue; }
    if (atTime.length && !allowSameTime) {
      report.uncertain = (report.uncertain || 0) + 1;
      report.conflicts.push(`Possible duplicate at ${record.startTime}; skipped. Existing dive kept. Check the source files before importing separately.`);
      continue;
    }
    dives.push({ ...record, id: newId(), sourceFileId: fileId, original: measurements(record), corrections: {} });
    report.accepted++;
    if (!inTrip(record, trip.config)) report.outsideTrip++;
  }
  return { ...trip, dives, updatedAt: new Date().toISOString() };
}
export function correctDive(trip: Trip, diveId: string, field: EditableField, value: string | number | null): Trip {
  const dive = trip.dives.find(d => d.id === diveId);
  if (!dive) throw new Error('Dive no longer exists.');
  if (field === 'maxDepthM' || field === 'durationSec' || field === 'waterTempC') {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Enter a finite number.');
    if (field !== 'waterTempC' && (value === null || Number(value) < 0 || (field === 'durationSec' && Number(value) === 0))) throw new Error('Depth must be zero or greater; duration must be greater than zero.');
  } else if (value !== null && typeof value !== 'string') throw new Error('Enter text.');
  const at = new Date().toISOString();
  return { ...trip, updatedAt: at, dives: trip.dives.map(d => d.id === diveId ? { ...d, corrections: { ...d.corrections, [field]: value } } : d),
    audit: [...trip.audit, { diveId, field, before: effective(dive)[field] ?? null, after: value, at }].slice(-500) };
}
export function missingFields(d: ImportedDive): string[] {
  return [d.maxDepthM === undefined || !Number.isFinite(d.maxDepthM) || d.maxDepthM < 0 ? 'depth' : '', d.durationSec === undefined || !Number.isFinite(d.durationSec) || Math.round(d.durationSec / 60) < 1 ? 'duration' : ''].filter(Boolean);
}
export function base64Bytes(base64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const text = base64.replace(/\s/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw new Error('Invalid binary file encoding.');
  const result = new Uint8Array(text.length * 3 / 4 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0));
  let accumulator = 0, bits = 0, index = 0;
  for (const char of text.replace(/=+$/, '')) {
    accumulator = (accumulator << 6) | alphabet.indexOf(char); bits += 6;
    if (bits >= 8) { bits -= 8; result[index++] = (accumulator >> bits) & 255; }
  }
  return result;
}
