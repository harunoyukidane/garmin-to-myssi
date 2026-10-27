import { Store, emptyStore } from './model';
import { validateConfig } from './domain';

export interface StoreFiles {
  exists(name: string): Promise<boolean>;
  read(name: string): Promise<string>;
  write(name: string, body: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function finite(value: unknown) { return typeof value === 'number' && Number.isFinite(value); }
function date(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function validateMeasurement(d: Record<string, unknown>) {
  for (const k of ['durationSec', 'maxDepthM', 'waterTempC', 'maxWaterTempC']) if (d[k] !== undefined && !finite(d[k])) throw new Error('Invalid saved measurement.');
  for (const k of ['locationName', 'notes']) if (d[k] !== undefined && typeof d[k] !== 'string') throw new Error('Invalid saved text.');
}
export function decodeStore(text: string): Store {
  const value: unknown = JSON.parse(text);
  if (!object(value)) throw new Error('Invalid saved store.');
  if (value.schemaVersion !== 1) throw new Error('Unsupported saved data version. Update the app before opening this data.');
  if (!Array.isArray(value.trips)) throw new Error('Invalid saved trips.');
  const tripIds = new Set<string>();
  for (const t of value.trips) {
    if (!object(t) || typeof t.id !== 'string' || tripIds.has(t.id) || !object(t.config) || !Array.isArray(t.dives) || !Array.isArray(t.files) || !Array.isArray(t.audit) || !date(t.createdAt) || !date(t.updatedAt)) throw new Error('Invalid saved trip.');
    tripIds.add(t.id);
    const c = t.config;
    if (validateConfig(c as unknown as import('./model').TripConfig).length) throw new Error('Invalid saved trip settings.');
    if (typeof c.tripStartDate !== 'string' || typeof c.tripEndDate !== 'string' || !finite(c.ssiStartDiveNumber) || !finite(c.utcOffsetMinutes)) throw new Error('Invalid saved trip settings.');
    if (!Number.isSafeInteger(Number(c.ssiStartDiveNumber) + t.dives.length)) throw new Error('SSI numbers exceed the supported whole number range.');
    const fileIds = new Set<string>();
    for (const f of t.files) {
      if (!object(f) || typeof f.id !== 'string' || fileIds.has(f.id) || typeof f.uri !== 'string' || typeof f.name !== 'string' || typeof f.fingerprint !== 'string' || !date(f.importedAt)) throw new Error('Invalid saved file.');
      fileIds.add(f.id);
    }
    const diveIds = new Set<string>();
    for (const d of t.dives) {
      if (!object(d) || typeof d.id !== 'string' || diveIds.has(d.id) || !date(d.startTime) || !object(d.original) || !object(d.corrections) || typeof d.sourceFileId !== 'string' || !fileIds.has(d.sourceFileId)) throw new Error('Invalid saved dive.');
      if (d.diveKind !== undefined && !['scuba', 'freedive', 'ccr'].includes(String(d.diveKind))) throw new Error('Invalid saved dive type.');
      if (d.ssiTypeOverride !== undefined && (typeof d.ssiTypeOverride !== 'number' || ![0, 2, 4, 6, 8].includes(d.ssiTypeOverride))) throw new Error('Invalid SSI dive type.');
      if (d.ssiMarkedSavedAt !== undefined && !date(d.ssiMarkedSavedAt)) throw new Error('Invalid transfer checklist.');
      diveIds.add(d.id); validateMeasurement(d); validateMeasurement(d.original);
      if (d.garminStats !== undefined) {
        if (!object(d.garminStats)) throw new Error('Invalid Garmin statistics.');
        for (const [key, v] of Object.entries(d.garminStats)) {
          if (key === 'waterType' ? !['fresh', 'salt'].includes(String(v)) : !finite(v)) throw new Error('Invalid Garmin statistic.');
        }
      }
      for (const [field, v] of Object.entries(d.corrections)) {
        if (!['durationSec', 'maxDepthM', 'waterTempC', 'locationName', 'notes'].includes(field)) throw new Error('Invalid correction field.');
        if (v !== null) validateMeasurement({ [field]: v });
      }
    }
    for (const a of t.audit) if (!object(a) || typeof a.diveId !== 'string' || !date(a.at) || typeof a.field !== 'string') throw new Error('Invalid saved audit event.');
  }
  return value as unknown as Store;
}
export function createRepository(files: StoreFiles) {
  let queue = Promise.resolve();
  let blocked = false;
  let loaded = false;
  let current = emptyStore();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const task = queue.then(work); queue = task.then(() => undefined, () => undefined); return task;
  };
  return {
    load: () => serial(async () => {
      blocked = true;
      const hasPrimary = await files.exists('store.json');
      const hasBackup = await files.exists('backup.json');
      const pending = await files.exists('pending.json');
      let warning: string | undefined;
      let data: Store | undefined;
      if (hasPrimary) {
        const raw = await files.read('store.json');
        // A newer schema must never be replaced by an older backup.
        try { const parsed = JSON.parse(raw); if (parsed?.schemaVersion !== undefined && parsed.schemaVersion !== 1) { blocked = true; throw new Error('Unsupported saved data version. Update the app to open it.'); } } catch (e) { if (e instanceof Error && e.message.startsWith('Unsupported')) throw e; }
        try { data = decodeStore(raw); } catch { warning = 'The saved data was damaged.'; }
      }
      if (!data && hasBackup) {
        try { data = decodeStore(await files.read('backup.json')); warning = 'Recovered the last saved backup. The most recent change may be missing.'; }
        catch { blocked = true; throw new Error('Saved data and backup are unreadable. Data has been preserved; retry or restore it before continuing.'); }
      }
      if (!data && (hasPrimary || pending)) { blocked = true; throw new Error('Saved data is incomplete or unreadable. It has been preserved; no empty store was created.'); }
      current = data || emptyStore(); loaded = true; blocked = false;
      return { data: current, warning };
    }),
    update: (change: (store: Store) => Store) => serial(async () => {
      if (!loaded || blocked) throw new Error('Load saved data successfully before making changes.');
      const next = decodeStore(JSON.stringify(change(current)));
      const body = JSON.stringify(next);
      try {
        await files.write('pending.json', body);
        decodeStore(await files.read('pending.json'));
        await files.write('backup.json', JSON.stringify(current));
        decodeStore(await files.read('backup.json'));
        // Keep the validated backup while replacing the primary.
        await files.remove('store.json');
        await files.move('pending.json', 'store.json');
        decodeStore(await files.read('store.json'));
        current = next; return next;
      } catch (error) {
        blocked = true;
        throw new Error(`Save failed. Reload saved trips before retrying. ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  };
}
