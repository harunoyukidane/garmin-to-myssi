import React, { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Button, Text, View } from 'react-native';
import { emptyStore, Store, Trip, TripConfig, EditableField, newId } from '../../shared/model';
import { base64Bytes, correctDive, validateConfig } from '../../shared/domain';
import { parseFit } from '../../shared/parsers/fit';
import { diveCoordinates } from '../../shared/enrichment';
import { appDirectory, ensureDirectories, repository } from '../services/localStore';
import * as FileSystem from 'expo-file-system';
import { applyEnrichment, enrichmentKey } from '../../shared/enrichment';
import { lookupTrip } from '../services/enrichment';
import { defaultSsiConditions, SsiConditions, validateSsiConditions } from '../../shared/ssiConditions';

type Context = { data: Store; busy: boolean; run: (task: () => Promise<void>) => void; saveTrip: (config: TripConfig, id?: string, defaults?: SsiConditions, airTempC?: number) => Promise<string>;
  updateTrip: (trip: Trip) => Promise<void>; removeTrip: (id: string) => Promise<void>;
  transactTrip: (id: string, change: (trip: Trip) => Promise<Trip>) => Promise<void>;
  enrich: (tripId: string) => Promise<void>;
  saveSsiDefaults: (defaults: SsiConditions) => Promise<void>;
  saveSsiConditions: (tripId: string, diveId: string, conditions: SsiConditions, airTempC?: number, airChanged?: boolean) => Promise<void>;
  correct: (tripId: string, diveId: string, field: EditableField, value: string | number | null) => Promise<void> };
const TripContext = createContext<Context | null>(null);
export function TripProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<Store>(emptyStore());
  const [enrichmentTick, setEnrichmentTick] = useState(0);
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [warning, setWarning] = useState('');
  const lock = useRef(false);
  const attempted = useRef(new Map<string, string>());
  const retryAt = useRef(new Map<string, number>());
  const retryCount = useRef(new Map<string, number>());
  const repairedFiles = useRef(new Set<string>());
  const enriching = useRef(false);
  async function load() {
    await ensureDirectories(); const result = await repository.load(); setData(result.data); setWarning(result.warning || ''); setLoaded(true);
  }
  function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    task().catch(e => setError(e instanceof Error ? e.message : String(e))).finally(() => { lock.current = false; setBusy(false); });
  }
  useEffect(() => { run(load); }, []);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') setEnrichmentTick(t => t + 1); }, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setEnrichmentTick(t => t + 1); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  async function update(change: (store: Store) => Store | Promise<Store>) { setData(await repository.update(change)); }
  const context: Context = { data, busy, run,
    saveSsiDefaults: async defaults => {
      validateSsiConditions(defaults);
      await update(store => ({ ...store, ssiDefaults: defaults }));
    },
    saveSsiConditions: async (tripId, diveId, conditions, airTempC, airChanged = true) => {
      validateSsiConditions(conditions);
      if (airTempC !== undefined && (!Number.isFinite(airTempC) || airTempC < -100 || airTempC > 70)) throw new Error('Air temperature must be between -100 and 70 °C.');
      await update(store => {
        if (!store.trips.some(t => t.id === tripId && t.dives.some(d => d.id === diveId))) throw new Error('Dive no longer exists.');
        return { ...store, trips: store.trips.map(t => t.id === tripId ? { ...t, updatedAt: new Date().toISOString(), dives: t.dives.map(d => d.id === diveId ? { ...d, ssiConditionOverrides: conditions, ...(airChanged ? { ssiAirTempC: airTempC, airTempManual: true } : {}) } : d) } : t) };
      });
    },
    transactTrip: async (id, change) => update(async store => {
      const current = store.trips.find(t => t.id === id);
      if (!current) throw new Error('Trip no longer exists.');
      const next = await change(current);
      return { ...store, trips: store.trips.map(t => t.id === id ? next : t) };
    }),
    saveTrip: async (config, id, defaults, airTempC) => {
      if (defaults) validateSsiConditions(defaults);
      if (airTempC !== undefined && (!Number.isFinite(airTempC) || airTempC < -100 || airTempC > 70)) throw new Error('Invalid air temperature.');
      const errors = validateConfig(config); if (errors.length) throw new Error(errors.join('\n'));
      const tripId = id || newId(), now = new Date().toISOString();
      await update(store => {
        if (id && !store.trips.some(t => t.id === id)) throw new Error('Trip no longer exists.');
        return { ...store, trips: id ? store.trips.map(t => t.id === id ? { ...t, config, ssiDefaults: defaults ?? t.ssiDefaults, ssiAirTempC: airTempC, updatedAt: now } : t)
          : [...store.trips, { id: tripId, config, dives: [], files: [], audit: [], ssiDefaults: defaults ?? { ...defaultSsiConditions, ...store.ssiDefaults }, ssiAirTempC: airTempC, createdAt: now, updatedAt: now }] };
      }); return tripId;
    },
    updateTrip: async trip => update(store => {
      if (!store.trips.some(t => t.id === trip.id)) throw new Error('Trip no longer exists.');
      return { ...store, trips: store.trips.map(t => t.id === trip.id ? trip : t) };
    }),
    removeTrip: async id => {
      // Write a second checkpoint so recovery cannot resurrect a deleted trip with missing source files.
      let removed: Trip | undefined;
      await update(store => { removed = store.trips.find(t => t.id === id); return { ...store, trips: store.trips.filter(t => t.id !== id) }; });
      await update(store => store);
      for (const f of removed?.files || []) if (f.uri.startsWith(appDirectory() + 'sources/')) await FileSystem.deleteAsync(f.uri, { idempotent: true }).catch(() => undefined);
    },
    enrich: async tripId => {
      const snapshot = (await repository.load()).data.trips.find(t => t.id === tripId);
      if (!snapshot?.dives.length) return;
      const originalKey = enrichmentKey(snapshot);
      // Recover GPS from already stored FITs without requiring a duplicate import.
      for (const file of snapshot.files.filter(f => /\.fit$/i.test(f.name))) {
        if (repairedFiles.current.has(file.uri) || !snapshot.dives.some(d => d.sourceFileId === file.id && !diveCoordinates(d.garminStats))) continue;
        repairedFiles.current.add(file.uri);
        try {
          const parsed = parseFit(base64Bytes(await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 })));
          for (const dive of snapshot.dives.filter(d => d.sourceFileId === file.id && !diveCoordinates(d.garminStats))) {
            const matches = parsed.dives.filter(d => d.startTime === dive.startTime);
            if (matches.length === 1 && diveCoordinates(matches[0].garminStats)) dive.garminStats = { ...dive.garminStats, ...matches[0].garminStats };
          }
        } catch { /* Missing source files must not stop other lookups. */ }
      }
      const results = await lookupTrip(snapshot);
      await update(store => ({ ...store, trips: store.trips.map(t => t.id === tripId && enrichmentKey(t) === originalKey ? applyEnrichment({ ...t, dives: t.dives.map(d => ({ ...d, garminStats: snapshot.dives.find(s => s.id === d.id)?.garminStats ?? d.garminStats })) }, results) : t) }));
    },
    correct: async (tripId, diveId, field, value) => update(store => {
      if (!store.trips.some(t => t.id === tripId)) throw new Error('Trip no longer exists.');
      return { ...store, trips: store.trips.map(t => t.id === tripId ? correctDive(t, diveId, field, value) : t) };
    })
  };
  useEffect(() => {
    if (!loaded || busy || enriching.current) return;
    const pending = data.trips.find(t => t.dives.length && (t.enrichmentKey !== enrichmentKey(t) || t.dives.some(d => !d.enrichment || d.enrichment.errors?.length)) && (attempted.current.get(t.id) !== enrichmentKey(t) || Date.now() >= (retryAt.current.get(t.id) ?? 0)));
    if (!pending) return;
    attempted.current.set(pending.id, enrichmentKey(pending));
    const count = retryCount.current.get(pending.id) ?? 0;
    retryCount.current.set(pending.id, count + 1);
    retryAt.current.set(pending.id, Date.now() + Math.min(1800000, 60000 * 2 ** Math.min(count, 5)));
    enriching.current = true;
    void context.enrich(pending.id).catch(e => setError(e instanceof Error ? e.message : 'Could not save lookup results. Reload saved trips before retrying.')).finally(() => { enriching.current = false; setEnrichmentTick(t => t + 1); });
  }, [loaded, busy, data, enrichmentTick]);
  return <TripContext.Provider value={context}>
    {(error || warning) ? <View style={{ padding: 12, backgroundColor: '#FFF3D6' }}>
      <Text selectable>{error || warning}</Text>
      {error ? <Button title="Reload saved trips" disabled={busy} onPress={() => run(async () => { await load(); })} /> : <Button title="Dismiss" onPress={() => setWarning('')} />}
    </View> : null}
    {busy && <ActivityIndicator accessibilityLabel="Working" style={{ padding: 6 }} />}
    {loaded ? children : <View style={{ padding: 24 }}><Text>Opening saved trips…</Text></View>}
  </TripContext.Provider>;
}
export function useTrips() { const context = useContext(TripContext); if (!context) throw new Error('Trip provider missing.'); return context; }
