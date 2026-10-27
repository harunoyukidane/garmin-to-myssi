import { CsvMapping, ImportedDive } from '../model';

export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') { if (input[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error('Unexpected quote in CSV.');
      quoted = true;
    } else if (c === ',' || c === '\r' || c === '\n') {
      row.push(cell); cell = ''; closed = false;
      if (c !== ',') { if (row.some(v => v.trim())) rows.push(row); row = []; if (c === '\r' && input[i + 1] === '\n') i++; }
    } else { if (closed) throw new Error('Unexpected text after closing CSV quote.'); cell += c; }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function suggestMapping(headers: string[]): CsvMapping {
  const pick = (...names: string[]) => headers.find(h => names.some(n => n.toLowerCase() === h.toLowerCase())) || '';
  return { start: pick('startTime', 'startedAt', 'Date'), id: pick('id', 'activityId'), duration: pick('durationSec', 'durationSeconds'),
    depth: pick('maxDepthM', 'maxDepthMeters'), temperature: pick('waterTempC', 'waterTemperatureCelsius'),
    location: pick('locationName', 'location', 'Title'), notes: pick('notes'), durationUnit: 'seconds', depthUnit: 'm', temperatureUnit: 'C' };
}
export function parseTimestamp(raw: string, offset: number): string {
  const value = raw.trim().replace(' ', 'T');
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!match) throw new Error('Start time must be YYYY-MM-DD HH:mm[:ss] with an optional UTC offset.');
  const [, date, h, m, s = '00', fraction = '', zone] = match;
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || +h > 23 || +m > 59 || +s > 59) throw new Error('Invalid calendar date or time.');
  const sign = offset < 0 ? '-' : '+';
  const offsetString = `${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
  const timestamp = Date.parse(`${date}T${h}:${m}:${s}${fraction}${zone || offsetString}`);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid time zone offset.');
  return new Date(timestamp).toISOString();
}
function numeric(raw: string, label: string): number | undefined {
  if (!raw.trim() || raw.trim() === '--') return undefined;
  const n = Number(raw); if (!Number.isFinite(n)) throw new Error(`Invalid ${label}: ${raw}`); return n;
}
function duration(raw: string, unit: CsvMapping['durationUnit']): number | undefined {
  if (!raw.trim() || raw.trim() === '--') return undefined;
  if (unit !== 'clock') { const n = numeric(raw, 'duration'); return n === undefined ? undefined : n * (unit === 'minutes' ? 60 : 1); }
  if (!/^\d+:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw)) throw new Error('Duration must be mm:ss or hh:mm:ss.');
  const parts = raw.split(':').map(Number);
  if (parts.slice(1).some(n => n >= 60)) throw new Error('Invalid duration clock components.');
  return parts.reduce((total, n) => total * 60 + n, 0);
}
export function parseCsv(text: string, mapping: CsvMapping, offset: number): { dives: ImportedDive[]; errors: string[] } {
  const [headers, ...rows] = csvRows(text);
  if (!headers?.length || !rows.length) throw new Error('CSV has no data rows.');
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names.');
  if (!mapping.start || !headers.includes(mapping.start)) throw new Error('Choose a valid start time column.');
  for (const key of ['id', 'duration', 'depth', 'temperature', 'location', 'notes'] as const) {
    if (mapping[key] && !headers.includes(mapping[key]!)) throw new Error(`Column not found: ${mapping[key]}`);
  }
  const dives: ImportedDive[] = [], errors: string[] = [];
  rows.forEach((row, index) => {
    try {
      if (row.length !== headers.length) throw new Error(`Expected ${headers.length} cells, found ${row.length}.`);
      const data = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
      const activity = data['Activity Type'] || data.activityType;
      if (activity && (/sky.?div/i.test(activity) || !/scuba|div(e|ing)|apnea|ccr/i.test(activity))) return;
      const read = (name: string | undefined) => name ? data[name] || '' : '';
      const depth = numeric(read(mapping.depth), 'depth'), temp = numeric(read(mapping.temperature), 'temperature');
      const durationSec = duration(read(mapping.duration), mapping.durationUnit);
      if (depth !== undefined && depth < 0) throw new Error('Depth cannot be negative.');
      if (durationSec !== undefined && durationSec <= 0) throw new Error('Duration must be greater than zero.');
      dives.push({ diveKind: /apnea|free.?div/i.test(activity || '') ? 'freedive' : /ccr|closed.?circuit/i.test(activity || '') ? 'ccr' : 'scuba', startTime: parseTimestamp(read(mapping.start), offset), sourceId: read(mapping.id) || undefined,
        durationSec, maxDepthM: depth === undefined ? undefined : depth * (mapping.depthUnit === 'ft' ? 0.3048 : 1),
        waterTempC: temp === undefined ? undefined : mapping.temperatureUnit === 'F' ? (temp - 32) * 5 / 9 : temp,
        locationName: read(mapping.location) || undefined, notes: read(mapping.notes) || undefined });
    } catch (e) { errors.push(`Row ${index + 2}: ${e instanceof Error ? e.message : String(e)}`); }
  });
  return { dives, errors };
}
