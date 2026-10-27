import React, { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { emptyStore, Store, Trip, TripConfig, EditableField, newId } from '../../shared/model';
import { correctDive, validateConfig } from '../../shared/domain';
import { appDirectory, ensureDirectories, repository } from '../services/localStore';
import * as FileSystem from 'expo-file-system';

type Context = { data: Store; busy: boolean; run: (task: () => Promise<void>) => void; saveTrip: (config: TripConfig, id?: string) => Promise<string>;
  updateTrip: (trip: Trip) => Promise<void>; removeTrip: (id: string) => Promise<void>;
  setSsiType: (tripId: string, diveId: string, type: number) => Promise<void>;
  confirmSsiSaved: (tripId: string, diveId: string, saved: boolean) => Promise<void>;
  correct: (tripId: string, diveId: string, field: EditableField, value: string | number | null) => Promise<void> };
const TripContext = createContext<Context | null>(null);
export function TripProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<Store>(emptyStore());
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [warning, setWarning] = useState('');
  const lock = useRef(false);
  async function load() {
    await ensureDirectories(); const result = await repository.load(); setData(result.data); setWarning(result.warning || ''); setLoaded(true);
  }
  function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    task().catch(e => setError(e instanceof Error ? e.message : String(e))).finally(() => { lock.current = false; setBusy(false); });
  }
  useEffect(() => { run(load); }, []);
  async function update(change: (store: Store) => Store) { setData(await repository.update(change)); }
  const context: Context = { data, busy, run,
    saveTrip: async (config, id) => {
      const errors = validateConfig(config); if (errors.length) throw new Error(errors.join('\n'));
      const tripId = id || newId(), now = new Date().toISOString();
      await update(store => {
        if (id && !store.trips.some(t => t.id === id)) throw new Error('Trip no longer exists.');
        return { ...store, trips: id ? store.trips.map(t => t.id === id ? { ...t, config, updatedAt: now } : t)
          : [...store.trips, { id: tripId, config, dives: [], files: [], audit: [], createdAt: now, updatedAt: now }] };
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
    setSsiType: async (tripId, diveId, type) => update(store => {
      if (![0, 2, 4, 6, 8].includes(type)) throw new Error('Unsupported SSI type.');
      return { ...store, trips: store.trips.map(t => t.id === tripId ? { ...t, dives: t.dives.map(d => d.id === diveId ? { ...d, ssiTypeOverride: type } : d) } : t) };
    }),
    confirmSsiSaved: async (tripId, diveId, saved) => update(store => ({ ...store, trips: store.trips.map(t => t.id === tripId ? { ...t, dives: t.dives.map(d => d.id === diveId ? { ...d, ssiMarkedSavedAt: saved ? new Date().toISOString() : undefined } : d) } : t) })),
    correct: async (tripId, diveId, field, value) => update(store => {
      if (!store.trips.some(t => t.id === tripId)) throw new Error('Trip no longer exists.');
      return { ...store, trips: store.trips.map(t => t.id === tripId ? correctDive(t, diveId, field, value) : t) };
    })
  };
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
