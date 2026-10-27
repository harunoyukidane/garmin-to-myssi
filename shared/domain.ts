import { Dive, EditableField, ImportedDive, ImportReport, Measurements, NumberedDive, Trip, TripConfig, newId } from './model';

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateConfig(config: TripConfig): string[] {
  const errors: string[] = [];
  if (!validDate(config.tripStartDate) || !validDate(config.tripEndDate)) errors.push('Enter real dates as YYYY-MM-DD.');
  if (config.tripStartDate > config.tripEndDate) errors.push('End date must be on or after start date.');
  if (!Number.isSafeInteger(config.ssiStartDiveNumber) || config.ssiStartDiveNumber < 1) errors.push('First SSI number must be a positive whole number.');
  if (!Number.isInteger(config.utcOffsetMinutes) || config.utcOffsetMinutes < -720 || config.utcOffsetMinutes > 840) errors.push('UTC offset must be whole minutes from -720 to 840.');
  return errors;
}
export function localDateTime(instant: string, offset: number): string {
  return new Date(Date.parse(instant) + offset * 60000).toISOString().slice(0, 19).replace('T', ' ');
}
export function offsetLabel(minutes: number): string {
  return `UTC${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
}
export function effective(dive: Dive): Dive {
  const result = { ...dive, ...dive.original };
  for (const field of Object.keys(dive.corrections) as EditableField[]) {
    const value = dive.corrections[field];
    (result as unknown as Record<string, unknown>)[field] = value === null ? undefined : value;
  }
  return result;
}
export function inTrip(dive: ImportedDive, config: TripConfig): boolean {
  const date = localDateTime(dive.startTime, config.utcOffsetMinutes).slice(0, 10);
  return date >= config.tripStartDate && date <= config.tripEndDate;
}
export function tripDives(trip: Trip): NumberedDive[] {
  if (!Number.isSafeInteger(trip.config.ssiStartDiveNumber + trip.dives.length)) throw new Error('SSI numbers exceed the supported whole number range.');
  return trip.dives.filter(d => inTrip(d, trip.config)).sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || a.id.localeCompare(b.id))
    .map((dive, index) => ({ ...effective(dive), ssiDiveNumber: trip.config.ssiStartDiveNumber + index }));
}
export function measurements(d: ImportedDive): Measurements {
  return { durationSec: d.durationSec, maxDepthM: d.maxDepthM, waterTempC: d.waterTempC, maxWaterTempC: d.maxWaterTempC, locationName: d.locationName, notes: d.notes };
}
function sameMeasurements(a: Measurements, b: Measurements): boolean {
  return a.durationSec === b.durationSec && a.maxDepthM === b.maxDepthM && a.waterTempC === b.waterTempC;
}
export function mergeDives(trip: Trip, records: ImportedDive[], fileId: string, report: ImportReport, allowSameTime = false): Trip {
  const dives = [...trip.dives];
  for (const record of records) {
    if (!Number.isFinite(Date.parse(record.startTime))) { report.failures.push('Invalid dive start time.'); continue; }
    const byId = record.sourceId && dives.find(d => d.sourceId === record.sourceId);
    const atTime = dives.filter(d => d.startTime === record.startTime);
    if (byId) {
      if (byId.startTime !== record.startTime || (byId.diveKind || 'scuba') !== (record.diveKind || 'scuba') || !sameMeasurements(byId.original, measurements(record))) report.conflicts.push(`Activity ${record.sourceId} has different imported values; existing dive kept. Remove the trip and reimport to replace its source values.`);
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
  return [d.maxDepthM === undefined ? 'depth' : '', d.durationSec === undefined ? 'duration' : '', !d.locationName?.trim() ? 'location' : ''].filter(Boolean);
}
function csvCell(value: string | number | undefined): string {
  let text = value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function generateExport(trip: Trip, format: 'csv' | 'json', at = new Date()): { fileName: string; mime: string; body: string } {
  const dives = tripDives(trip);
  if (!dives.length) throw new Error('No dives inside this trip to export.');
  const fileName = `dive-review-${trip.config.tripStartDate}-${trip.config.tripEndDate}-${at.toISOString().replace(/[:.]/g, '-')}.${format}`;
  if (format === 'json') return { fileName, mime: 'application/json', body: JSON.stringify({ schemaVersion: 1, exportedAt: at.toISOString(), trip: trip.config,
    dives: dives.map(d => ({ sourceId: d.sourceId, startTime: d.startTime, diveKind: d.diveKind, ssiDiveNumber: d.ssiDiveNumber, ...measurements(d), garminStats: d.garminStats, missingFields: missingFields(d) })) }, null, 2) };
  const header = 'diveNumber,diveDate,diveTime,utcOffset,maxDepthM,bottomTimeMinutes,waterTempC,location,notes,maxWaterTempC,avgDepthM,surfaceIntervalSec,latitude,longitude,avgHeartRateBpm,maxHeartRateBpm,endCnsPercent,oxygenToxicityOtu,waterType';
  const rows = dives.map(d => {
    const local = localDateTime(d.startTime, trip.config.utcOffsetMinutes);
    return [d.ssiDiveNumber, local.slice(0, 10), local.slice(11), offsetLabel(trip.config.utcOffsetMinutes), d.maxDepthM,
      d.durationSec === undefined ? undefined : Number((d.durationSec / 60).toFixed(2)), d.waterTempC, d.locationName, d.notes,
      d.maxWaterTempC, d.garminStats?.avgDepthM, d.garminStats?.surfaceIntervalSec, d.garminStats?.latitude, d.garminStats?.longitude,
      d.garminStats?.avgHeartRateBpm, d.garminStats?.maxHeartRateBpm, d.garminStats?.endCnsPercent, d.garminStats?.oxygenToxicityOtu, d.garminStats?.waterType].map(csvCell).join(',');
  });
  return { fileName, mime: 'text/csv', body: '\uFEFF' + [header, ...rows].join('\r\n') };
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
