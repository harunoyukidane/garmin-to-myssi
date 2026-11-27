import React, { useEffect, useRef, useState } from 'react';
import { Linking, Text, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTrips } from '../state/TripProvider';
import { connectGarmin, disconnectGarmin, getGarminConnection } from '../services/garminConnection';
import { garminKeyUrl } from '../../shared/garminApi';
import { offsetLabel } from '../../shared/domain';
import { syncTrip } from '../services/garminSync';
import { SyncStorageError } from '../../shared/garminSync';
import { getGeoNamesUsername, saveGeoNamesUsername } from '../services/geoNamesSettings';

export function GarminConnectionScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'GarminConnection'>) {
  const { busy, run } = useTrips();
  const [key, setKey] = useState(''), [account, setAccount] = useState(''), [message, setMessage] = useState('');
  const controller = useRef<AbortController>();
  const [username, setUsername] = useState(''), [settingsLoaded, setSettingsLoaded] = useState(false);
  useEffect(() => { getGeoNamesUsername().then(value => { setUsername(value); setSettingsLoaded(true); }).catch(() => setMessage('GeoNames settings could not be opened. Reopen this screen to retry.')); }, []);
  useEffect(() => { getGarminConnection().then(c => setAccount(c?.accountId || '')).catch(() => setMessage('Saved connection could not be opened. Replace the key.')); return () => controller.current?.abort(); }, []);
  return <Screen><Text style={{ fontSize: 25, fontWeight: '800' }}>Garmin connection</Text>
    <Text>{account ? `Connected · account ${account}` : 'No Garmin account connected'}</Text>
    <Text>Optional personal connection. Local import, corrections and MySSI QR export work offline without a key.</Text>
    <PrimaryButton label="Garmin API key settings" onPress={() => { Linking.openURL(garminKeyUrl).catch(() => setMessage('Could not open Garmin. Open Garmin Connect key settings in your browser.')); }} />
    <Text>Paste your Personal API key here. It is stored securely on this phone after validation.</Text>
    <TextInput accessibilityLabel="Garmin Personal API key" placeholder="Personal API key" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} value={key} onChangeText={setKey} style={{ borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 12, color: '#0F172A', backgroundColor: '#FFFFFF' }} />
    <PrimaryButton label={account ? 'Replace key' : 'Connect'} disabled={busy || !key.trim()} onPress={() => run(async () => {
      controller.current = new AbortController(); setMessage('Validating activity access…');
      try { const connection = await connectGarmin(key, controller.current.signal); setKey(''); setAccount(connection.accountId); setMessage('Connected securely.'); if (route.params?.tripId) navigation.replace('GarminSync', { tripId: route.params.tripId }); }
      catch (e) { setMessage(e instanceof Error ? e.message : 'Connection failed. Retry.'); }
      finally { setKey(''); controller.current = undefined; }
    })} />
    {busy && <PrimaryButton label="Cancel connection" onPress={() => controller.current?.abort()} />}
    <PrimaryButton label="Disconnect Garmin" disabled={busy || !account} onPress={() => run(async () => { await disconnectGarmin(); setAccount(''); setKey(''); setMessage('Local Garmin credentials removed. Imported dives are kept.'); })} />
    <Text>Disconnect removes credentials from this phone. To revoke access at Garmin, delete the key in Garmin Connect.</Text>
    <Text style={{ fontSize: 21, fontWeight: '700' }}>GeoNames</Text>
    <Text>Optional username for nearby geographic names. Enable free web services in your GeoNames account. Leave blank to use OpenStreetMap. Saved on this phone only.</Text>
    <TextInput accessibilityLabel="GeoNames username" placeholder="GeoNames username" autoCapitalize="none" autoCorrect={false} editable={!busy && settingsLoaded} value={username} onChangeText={setUsername} style={{ borderWidth: 1, borderColor: '#94A3B8', borderRadius: 8, padding: 12, color: '#0F172A', backgroundColor: '#FFFFFF' }} />
    <PrimaryButton label="Save GeoNames settings" disabled={busy || !settingsLoaded} onPress={() => run(async () => {
      await saveGeoNamesUsername(username); setUsername(username.trim());
      setMessage(username.trim() ? 'GeoNames username saved. New lookups will use this account.' : 'GeoNames disabled. New lookups will use OpenStreetMap.');
    })} />
    {!!message && <Text accessibilityLiveRegion="polite">{message}</Text>}
  </Screen>;
}

export function GarminSyncScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'GarminSync'>) {
  const { data, busy, run, transactTrip } = useTrips();
  const trip = data.trips.find(t => t.id === route.params.tripId);
  const [message, setMessage] = useState(''), [running, setRunning] = useState(false);
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);
  if (!trip) return <Screen><Text>Trip no longer exists.</Text></Screen>;
  const result = trip.garminSync;
  function start(retry = false) {
    run(async () => {
      const connection = await getGarminConnection();
      if (!connection) { navigation.replace('GarminConnection', { tripId: trip!.id }); return; }
      if (retry && result?.accountId !== connection.accountId) { setMessage('The connected account changed. Run a full sync for this account.'); return; }
      const abort = new AbortController(); controller.current = abort; setRunning(true);
      try {
        const done = await syncTrip(trip!, transactTrip, abort.signal, setMessage, retry ? result?.failures.filter(f => f.activityId !== 'query').map(f => ({ id: f.activityId, date: f.date })) : undefined);
        setMessage(done.cancelled ? 'Sync cancelled. Saved dives are kept; run sync again to reconcile unfinished activities.' : done.queryFailed ? 'Could not find activities. Retry sync.' : done.failures.length || done.conflicts.length ? 'Sync needs review. See the results below.' : done.added || done.duplicates ? 'Sync finished.' : 'No matching supported dives were found in this trip window.');
      } catch (e) { setMessage(e instanceof Error ? e.message : 'Sync stopped. Retry after checking your connection and storage.'); if (e instanceof SyncStorageError) throw e; }
      finally { setRunning(false); controller.current = undefined; }
    });
  }
  return <Screen><Text style={{ fontSize: 25, fontWeight: '800' }}>Sync Garmin</Text>
    <Text>{trip.config.tripStartDate} – {trip.config.tripEndDate} · {offsetLabel(trip.config.utcOffsetMinutes)}</Text>
    <Text>Find and download original activity files, then import supported dives within these dates. Activity files are checked through the FIT parser. Existing corrections are kept. GPS and historical weather lookups start after sync.</Text>
    <PrimaryButton label="Sync Garmin" disabled={busy} onPress={() => start()} />
    <PrimaryButton label="Garmin connection settings" disabled={busy} onPress={() => navigation.navigate('GarminConnection', { tripId: trip.id })} />
    {running && <PrimaryButton label="Cancel sync" onPress={() => { controller.current?.abort(); setMessage('Cancelling… an active local save will finish safely.'); }} />}
    {!!message && <Text accessibilityLiveRegion="polite">{message}</Text>}
    {result && <>
      <Text>{result.added} dives added · {result.duplicates} duplicates skipped · {result.failures.filter(f => f.activityId !== 'query').length} activities failed · {result.activities} activities processed{result.queryFailed ? ' · activity search failed' : ''}</Text>
      <Text>Last attempt: {result.attemptedAt}{result.cancelled ? ' · cancelled' : !result.completedAt ? ' · interrupted or incomplete' : ''}</Text>
      <Text>Last fully successful sync: {trip.garminLastSuccess || 'None yet'}</Text>
      {result.failures.map((f, i) => <Text key={i} selectable>{f.date} · Activity {f.activityId}: {f.reason}</Text>)}
      {result.conflicts.map((text, i) => <Text key={i} selectable>{text}</Text>)}
      {!!result.conflicts.length && <Text>Existing dives were preserved. Import the original file manually to review uncertain matches.</Text>}
      {!!result.failures.length && <PrimaryButton label={result.queryFailed ? 'Retry sync' : 'Retry failed activities'} disabled={busy} onPress={() => start(!result.queryFailed)} />}
    </>}
  </Screen>;
}
