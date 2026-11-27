import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QrExportReport } from '../../shared/qrBatch';
import { qrPng, ssiPayload, ssiAirTemperature } from '../../shared/ssiQr';
import { exportTripQrImages } from '../services/ssiTransfer';
import { fitLicense, qrLicense } from '../../shared/fitLicense';
import { archiveLicense } from '../../shared/archiveLicense';
import { SyncStorageError } from '../../shared/garminSync';
import { Alert, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { RootStackParamList } from '../navigation/types';
import { useTrips } from '../state/TripProvider';
import { Coordinates, CsvMapping, EditableField, ImportReport, TripConfig } from '../../shared/model';
import { effective, missingFields, offsetLabel, tripDives, validateConfig } from '../../shared/domain';
import { expandSelected, importFile, PreparedFile, prepareFile, SelectedFile, selectFiles } from '../services/fileImport';
import { defaultSsiConditions, SsiConditions } from '../../shared/ssiConditions';
import { ConditionEditor, ConditionSettings, ConditionSummary, AirInput, parseAir } from './SsiSettingsScreen';
import { useFocusEffect } from '@react-navigation/native';
import { getGarminConnection } from '../services/garminConnection';
import { diveLocalTime, diveOffset, validTimeZone, zoneOffset } from '../../shared/diveTime';
import { diveCoordinates } from '../../shared/enrichment';
import { googleFallback, searchDestinations } from '../services/enrichment';

type Props<Name extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, Name>;
const fieldLabels: Record<EditableField, string> = { maxDepthM: 'Maximum depth (m)', durationSec: 'Duration', waterTempC: 'Water temperature (°C)', locationName: 'Location', notes: 'Notes' };
const styles = StyleSheet.create({
  title: { color: '#0F172A', fontSize: 25, fontWeight: '800' },
  text: { color: '#334155', fontSize: 16, lineHeight: 23 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#D5E2E5', borderWidth: 1, borderRadius: 12, padding: 16, gap: 10 },
  label: { color: '#334155', fontSize: 15, fontWeight: '700' },
  input: { color: '#0F172A', backgroundColor: '#FFFFFF', borderColor: '#94A3B8', borderWidth: 1, borderRadius: 8, minHeight: 48, padding: 12, fontSize: 16 },
  error: { color: '#A33118', fontSize: 15, lineHeight: 22 },
  small: { color: '#64748B', fontSize: 13, lineHeight: 19 }
});
function Copy({ children }: React.PropsWithChildren) { return <Text style={styles.text}>{children}</Text>; }
function Input({ label, value, onChange, numeric = false, multiline = false }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean; multiline?: boolean }) {
  const { busy } = useTrips();
  return <View style={{ gap: 6 }}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} editable={!busy} value={value} onChangeText={onChange}
    keyboardType={numeric ? 'numbers-and-punctuation' : 'default'} autoCapitalize="none" autoCorrect={false} multiline={multiline} style={styles.input} /></View>;
}
export function TripsScreen({ navigation }: Props<'Trips'>) {
  const { data, busy, run, removeTrip } = useTrips();
  const [showLicense, setShowLicense] = useState(false);
  const [connected, setConnected] = useState(false);
  useFocusEffect(React.useCallback(() => { let active = true; void getGarminConnection().then(c => { if (active) setConnected(!!c); }).catch(() => { if (active) setConnected(false); }); return () => { active = false; }; }, []));
  return <Screen><Text style={styles.title}>Your dive trips</Text>
    <Copy>Import Garmin files and turn dives into MySSI QR codes. Imports and corrections stay on this phone. Online lookups use dive coordinates and timestamps.</Copy>
    <PrimaryButton label="Create trip" disabled={busy} onPress={() => navigation.navigate('TripSetup')} />
    <PrimaryButton label={`Garmin & GeoNames settings: ${connected ? 'Connected' : 'Disconnected'}`} disabled={busy} onPress={() => navigation.navigate('GarminConnection')} />
    <PrimaryButton label="Global SSI QR Settings" disabled={busy} onPress={() => navigation.navigate('SsiSettings')} />
    {!data.trips.length && <Copy>No trips yet. Create one, then select Garmin CSV or FIT files from your phone.</Copy>}
    {[...data.trips].reverse().map(trip => <View key={trip.id} style={styles.card}>
      <Text style={styles.label}>{trip.config.tripStartDate} – {trip.config.tripEndDate}</Text>
      <Copy>{tripDives(trip).length} dives</Copy>
      <PrimaryButton label="Open trip" disabled={busy} onPress={() => navigation.navigate('DiveList', { tripId: trip.id })} />
      <PrimaryButton label="Delete trip" disabled={busy} onPress={() => Alert.alert('Delete trip?', 'This removes the trip and its imported source files from this phone. Files already exported elsewhere are kept.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => run(() => removeTrip(trip.id)) }
      ])} />
    </View>)}
    <Text style={styles.small}>Uninstalling the app or clearing its data removes saved trips. Export QR images you want to keep.</Text>
    <PrimaryButton label={showLicense ? 'Hide third-party licenses' : 'Third-party licenses'} onPress={() => setShowLicense(!showLicense)} />
    {showLicense && <Text selectable style={styles.small}>{fitLicense}{'\n\n'}{qrLicense}{'\n\n'}{archiveLicense}</Text>}
  </Screen>;
}
export function TripSetupScreen({ navigation, route }: Props<'TripSetup'>) {
  const { data, busy, run, saveTrip } = useTrips();
  const tripId = route.params?.tripId, existing = data.trips.find(t => t.id === tripId);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [start, setStart] = useState(existing?.config.tripStartDate || today), [end, setEnd] = useState(existing?.config.tripEndDate || today);
  const offset = existing?.config.utcOffsetMinutes ?? -new Date().getTimezoneOffset();
  const [zone, setZone] = useState(existing?.config.destinationTimeZone || existing?.config.timeZoneOverride || '');
  const [destination, setDestination] = useState(existing?.config.destination || '');
  const [destinationCoordinates, setDestinationCoordinates] = useState<Coordinates | undefined>(existing?.config.destinationCoordinates);
  const [destinations, setDestinations] = useState<Array<Coordinates & { name: string; timeZone?: string }>>([]);
  const [destinationMessage, setDestinationMessage] = useState('');
  const [defaults, setDefaults] = useState<SsiConditions>({ ...defaultSsiConditions, ...(existing?.ssiDefaults ?? data.ssiDefaults) });
  const config: TripConfig = { tripStartDate: start, tripEndDate: end, utcOffsetMinutes: validTimeZone(zone) && /^\d{4}-\d{2}-\d{2}$/.test(start) && Number.isFinite(Date.parse(start)) ? zoneOffset(start + 'T12:00:00Z', zone) : offset, timeZoneOverride: existing?.config.timeZoneOverride, destinationTimeZone: zone.trim() || undefined, destination: destination.trim() || undefined, destinationCoordinates };
  const errors = validateConfig(config);
  return <Screen><Text style={styles.title}>{existing ? 'Trip Settings' : 'Create trip'}</Text>
    <Input label="Start date (YYYY-MM-DD)" value={start} onChange={setStart} />
    <Input label="End date (YYYY-MM-DD)" value={end} onChange={setEnd} />
    {(!existing || !existing.dives.some(d => diveCoordinates(d.garminStats))) && <View style={styles.card}>
      <Input label="Destination (when the trip has no GPS)" value={destination} onChange={value => { setDestination(value); setDestinationCoordinates(undefined); setZone(''); setDestinations([]); }} />
      <PrimaryButton label="Find destination" disabled={busy || !destination.trim()} onPress={() => run(async () => { const matches = await searchDestinations(destination); setDestinations(matches); setDestinationMessage(matches.length ? 'Choose a destination, then save the trip.' : 'No matching destination. Try a nearby town or island.'); })} />
      {destinations.map((p, i) => <PrimaryButton key={i} label={p.name} disabled={busy} onPress={() => { setDestination(p.name); setZone(p.timeZone || ''); setDestinationCoordinates({ latitude: p.latitude, longitude: p.longitude }); setDestinations([]); setDestinationMessage('Destination selected. Save the trip to apply.'); }} />)}
      {!!destinationCoordinates && <Copy>{destinationCoordinates.latitude.toFixed(4)}, {destinationCoordinates.longitude.toFixed(4)}</Copy>}
      {!!destinationMessage && <Copy>{destinationMessage}</Copy>}
    </View>}
    <Text style={styles.label}>SSI QR defaults</Text>
    <ConditionSettings values={defaults} onChange={setDefaults} />
    <PrimaryButton label="Apply global settings" disabled={busy} onPress={() => setDefaults({ ...defaultSsiConditions, ...data.ssiDefaults })} />
    <Copy>Time zone and historical air temperature are filled automatically from GPS or your selected destination.</Copy>
    {errors.map(e => <Text key={e} style={styles.error}>{e}</Text>)}
    <PrimaryButton label="Save trip" disabled={busy || !!errors.length} onPress={() => run(async () => {
      if (destination.trim() && !destinationCoordinates && !existing?.dives.some(d => diveCoordinates(d.garminStats))) throw new Error('Find and select your destination first.');
      const id = await saveTrip(config, tripId, defaults); navigation.replace('DiveList', { tripId: id });
    })} />
  </Screen>;
}
export function DiveListScreen({ navigation, route }: Props<'DiveList'>) {
  const { data, busy, run } = useTrips();
  const cancelExport = useRef(false);
  const [batchActive, setBatchActive] = useState(false), [batchReport, setBatchReport] = useState<QrExportReport>();
  const [message, setMessage] = useState('');
  useEffect(() => () => { cancelExport.current = true; }, []);
  const trip = data.trips.find(t => t.id === route.params.tripId);
  if (!trip) return <Screen><Copy>Trip no longer exists. Return to your trips.</Copy></Screen>;
  const dives = tripDives(trip);
  return <Screen><Text style={styles.title}>{trip.config.tripStartDate} – {trip.config.tripEndDate}</Text>
    <Copy>{dives.length} included · {trip.dives.length - dives.length} outside trip dates · {offsetLabel(trip.config.utcOffsetMinutes)}</Copy>
    <PrimaryButton label="Import Garmin files" disabled={busy} onPress={() => navigation.navigate('Import', { tripId: trip.id })} />
    <PrimaryButton label="Sync Garmin" disabled={busy} onPress={() => navigation.navigate('GarminSync', { tripId: trip.id })} />
    <PrimaryButton label="Trip Settings" disabled={busy} onPress={() => navigation.navigate('TripSetup', { tripId: trip.id })} />
    {!dives.length && <Copy>No dives inside these dates. Import files or adjust your trip dates.</Copy>}
    {dives.map(dive => <View key={dive.id} style={styles.card}>
      <Text style={styles.label}>Dive {dive.sequence}</Text>
      <Copy>{diveLocalTime(dive, trip.config)}</Copy>
      <Copy>{dive.locationName || (dive.enrichment?.checkedAt ? 'Location unavailable' : 'Finding location�')} · {dive.maxDepthM === undefined ? 'Depth missing' : `${dive.maxDepthM} m`}</Copy>
      {!!missingFields(dive).length && <Text style={styles.error}>Review: {missingFields(dive).join(', ')}</Text>}
      <PrimaryButton label="Review dive" disabled={busy} onPress={() => navigation.navigate('DiveDetail', { tripId: trip.id, diveId: dive.id })} />
    </View>)}
    <PrimaryButton label="Export all QR codes to gallery" disabled={busy || !dives.length} onPress={() => run(async () => {
      cancelExport.current = false; setBatchActive(true); setBatchReport(undefined);
      try {
        const report = await exportTripQrImages(trip, value => setMessage(`Exporting ${value.processed} of ${value.total} · Dive ${value.sequence}`), () => cancelExport.current);
        setBatchReport(report); setMessage(`${report.saved} of ${report.total} QR images saved${report.cancelled ? ' · cancelled' : ''}.`);
      } finally { setBatchActive(false); }
    })} />
    {batchActive && <PrimaryButton label="Stop after current image" onPress={() => { cancelExport.current = true; }} />}
    {batchReport?.failures.map(f => <Text key={f.sequence} style={styles.error}>Dive {f.sequence}: {f.reason}</Text>)}
    {!!message && <Copy>{message}</Copy>}
    <Copy>Open MySSI’s QR scanner and choose a saved image from the Dive Log Transfer gallery album. Review and save each dive in MySSI. MySSI assigns its dive number.</Copy>
    <Text style={styles.small}>Locations: © OpenStreetMap contributors (ODbL). Weather and time zones: Open-Meteo (CC BY 4.0), geographic names: GeoNames. Lookup results are saved for offline use. Location names are local references; QR codes cannot map them to SSI site IDs.</Text>
  </Screen>;
}
export function ImportScreen({ route }: Props<'Import'>) {
  const { data, busy, run, transactTrip } = useTrips();
  const trip = data.trips.find(t => t.id === route.params.tripId);
  const [queue, setQueue] = useState<SelectedFile[]>([]), [current, setCurrent] = useState<PreparedFile | undefined>();
  const [mapping, setMapping] = useState<CsvMapping | undefined>(), [report, setReport] = useState<ImportReport | undefined>();
  const [message, setMessage] = useState('');
  const [conflictFile, setConflictFile] = useState<{ file: PreparedFile; mapping?: CsvMapping }>();
  const [preparationError, setPreparationError] = useState('');
  const abort = useRef<AbortController>();
  const cleanups = useRef<(() => Promise<void>)[]>([]);
  const [batchActive, setBatchActive] = useState(false);
  useEffect(() => () => { abort.current?.abort(); for (const cleanup of cleanups.current) void cleanup().catch(() => undefined); }, []);
  useEffect(() => {
    if (!busy && !batchActive && !queue.length && !conflictFile) {
      const finished = cleanups.current.splice(0);
      for (const cleanup of finished) void cleanup().catch(() => undefined);
    }
  }, [busy, batchActive, queue.length, conflictFile]);
  async function commit(file: PreparedFile, selectedMapping?: CsvMapping, allow = false) {
    let result!: Awaited<ReturnType<typeof importFile>>;
    await transactTrip(route.params.tripId, async latest => { result = await importFile(latest, file, selectedMapping, allow); return result.trip; });
    return result;
  }
  async function prepare(file: SelectedFile | undefined) {
    setCurrent(undefined); setMapping(undefined); setPreparationError('');
    if (!file) return;
    try { const prepared = await prepareFile(file); setCurrent(prepared); setMapping(prepared.mapping); }
    catch (e) { setPreparationError(e instanceof Error ? e.message : String(e)); }
  }
  function mappingValue(key: keyof CsvMapping, value: string) { setMapping(previous => previous ? { ...previous, [key]: value } : previous); }
  async function next() { const remaining = queue.slice(1); setQueue(remaining); await prepare(remaining[0]); }
  if (!trip) return <Screen><Copy>Trip no longer exists.</Copy></Screen>;
  return <Screen><Text style={styles.title}>Import Garmin files</Text>
    <Copy>Select local .fit, .csv or multiple .zip exports. ZIPs are extracted automatically. Maximum 20 MB per source file; ZIP limit 32 MB, 128 entries, 80 MB extracted, compression ratio 200:1. Nested archives are unsupported.</Copy>
    <PrimaryButton label="Select files" disabled={busy || !!queue.length} onPress={() => run(async () => {
      const selected = await selectFiles(); if (!selected.length) return;
      for (const cleanup of cleanups.current) await cleanup(); cleanups.current = [];
      abort.current = new AbortController(); setBatchActive(true); setConflictFile(undefined);
      const files: SelectedFile[] = [], failures: string[] = [];
      try { for (const [i, file] of selected.entries()) {
        if (abort.current.signal.aborted) break;
        setMessage(`Preparing file ${i + 1} of ${selected.length}`);
        try { const expanded = await expandSelected(file, abort.current.signal); files.push(...expanded.files); cleanups.current.push(expanded.cleanup); failures.push(...expanded.unsupported.map(n => `${file.name}: unsupported entry ${n}`)); }
        catch (e) { if (!abort.current.signal.aborted) failures.push(`${file.name}: ${e instanceof Error ? e.message : 'Could not open file.'}`); if (e instanceof Error && /storage/i.test(e.message)) break; }
      } } finally { setBatchActive(false); }
      setQueue(files); setReport({ accepted: 0, duplicates: 0, outsideTrip: 0, conflicts: [], failures }); setMessage(abort.current.signal.aborted ? 'Preparation cancelled. Prepared files remain available below.' : 'Files prepared. Import FIT files together, or confirm CSV mappings individually.'); await prepare(files[0]);
    })} />
    {batchActive && <PrimaryButton label="Cancel batch" onPress={() => abort.current?.abort()} />}
    {!!queue.filter(f => /\.fit$/i.test(f.name)).length && <PrimaryButton label="Import all FIT files" disabled={busy} onPress={() => run(async () => {
      abort.current = new AbortController(); setBatchActive(true); setConflictFile(undefined);
      const total: ImportReport = { accepted: 0, duplicates: 0, outsideTrip: 0, failures: [], conflicts: [] };
      const remaining = [...queue];
      try { for (const [i, file] of queue.entries()) {
        if (abort.current.signal.aborted) break;
        if (!/\.fit$/i.test(file.name)) continue;
        setMessage(`Importing FIT file ${i + 1} of ${queue.length}`);
        try { const prepared = await prepareFile(file); if (abort.current.signal.aborted) break; const result = await commit(prepared);
          total.accepted += result.report.accepted; total.duplicates += result.report.duplicates; total.outsideTrip += result.report.outsideTrip;
          total.failures.push(...result.report.failures); total.conflicts.push(...result.report.conflicts.map(text => `${file.name}: ${text}`));
          if (result.report.uncertain) { setConflictFile({ file: prepared }); continue; }
        } catch (e) {
          const reason = e instanceof Error ? e.message : 'Import failed.'; total.failures.push(`${file.name}: ${reason}`);
          if (e instanceof SyncStorageError || /Save failed|Load saved data|Storage|storage|copy|space/i.test(reason)) throw e;
        }
        remaining.splice(remaining.indexOf(file), 1);
      } } finally { setBatchActive(false); setQueue(remaining); setReport(total); setMessage(`${total.accepted} dives added · ${total.duplicates} duplicates skipped${abort.current.signal.aborted ? ' · cancelled' : ''}. Saved dives are kept. CSV files need column and unit confirmation.`); await prepare(remaining[0]); }
    })} />}
    {!!queue.length && <Copy>{queue.length} files remaining · {queue[0].name}</Copy>}
    {!!preparationError && <Text style={styles.error}>{preparationError}</Text>}
    {current && <View style={styles.card}>
      <Text style={styles.label}>{current.name}</Text>
      {current.headers && mapping && <>
        <Copy>Confirm column names and units. Copy names exactly from the list below. Leave optional fields empty if unavailable.</Copy>
        <Text selectable style={styles.small}>Columns: {current.headers.join(' | ')}</Text>
        <Input label="Start time column" value={mapping.start} onChange={v => mappingValue('start', v)} />
        {(['id', 'duration', 'depth', 'temperature', 'location', 'notes', 'entryLatitude', 'entryLongitude', 'exitLatitude', 'exitLongitude', 'latitude', 'longitude'] as const).map(key => <Input key={key} label={`${key} column (optional)`} value={mapping[key] || ''} onChange={v => mappingValue(key, v)} />)}
        <Copy>Duration unit: {mapping.durationUnit}</Copy>
        <View style={{ gap: 6 }}>{(['seconds', 'minutes', 'clock'] as const).map(unit => <PrimaryButton key={unit} label={unit === 'clock' ? 'Use mm:ss or hh:mm:ss' : `Use ${unit}`} disabled={busy || mapping.durationUnit === unit} onPress={() => mappingValue('durationUnit', unit)} />)}</View>
        <Copy>Depth unit: {mapping.depthUnit}</Copy><PrimaryButton label={mapping.depthUnit === 'm' ? 'Change to feet' : 'Change to metres'} disabled={busy} onPress={() => mappingValue('depthUnit', mapping.depthUnit === 'm' ? 'ft' : 'm')} />
        <Copy>Temperature unit: °{mapping.temperatureUnit}</Copy><PrimaryButton label={mapping.temperatureUnit === 'C' ? 'Change to Fahrenheit' : 'Change to Celsius'} disabled={busy} onPress={() => mappingValue('temperatureUnit', mapping.temperatureUnit === 'C' ? 'F' : 'C')} />
        <Copy>Times without a UTC offset will use {offsetLabel(trip.config.utcOffsetMinutes)}. Start time must be YYYY-MM-DD HH:mm[:ss]. Confirm that this matches the source file before importing.</Copy>
      </>}
      <PrimaryButton label="Import this file" disabled={busy || (!!mapping && !mapping.start)} onPress={() => run(async () => {
        const result = await commit(current, mapping);
        setConflictFile(result.report.uncertain ? { file: current, mapping } : undefined);
        setReport(result.report); setMessage(result.report.accepted ? 'Accepted dives saved on this phone.' : 'No new dives saved.'); await next();
      })} />
    </View>}
    {!!queue.length && <PrimaryButton label="Skip this file" disabled={busy} onPress={() => run(next)} />}
    {!!queue.length && <PrimaryButton label="Cancel remaining files" disabled={busy} onPress={() => { setQueue([]); setCurrent(undefined); setMapping(undefined); setPreparationError(''); }} />}
    {!!message && <Copy>{message}</Copy>}
    {report && <View style={styles.card}><Copy>Import result: {report.accepted} accepted, {report.duplicates} duplicates, {report.outsideTrip} accepted outside trip dates.</Copy>
      {report.failures.map((e, i) => <Text key={`failure-${i}`} selectable style={styles.error}>{e}</Text>)}
      {report.conflicts.map((e, i) => <Text key={`conflict-${i}`} selectable style={styles.error}>{e}</Text>)}
      {!!report.conflicts.length && <Copy>Conflicting records were skipped. Existing dives and corrections were kept.</Copy>}
      {conflictFile && <PrimaryButton label="Import uncertain matches as separate dives" disabled={busy} onPress={() => Alert.alert('Keep both dives?', 'Only do this when the records at the same start time are different dives. Existing corrections will be preserved. This may change the trip sequence.', [ { text: 'Cancel', style: 'cancel' }, { text: 'Keep both', onPress: () => run(async () => { const result = await commit(conflictFile.file, conflictFile.mapping, true); setReport(result.report); setConflictFile(undefined); setMessage('Conflict resolution saved.'); }) } ])} />}
    </View>}
  </Screen>;
}
export function DiveDetailScreen({ navigation, route }: Props<'DiveDetail'>) {
  const { data, busy } = useTrips(); const { tripId, diveId } = route.params;
  const [showMeasurements, setShowMeasurements] = useState(false);
  const trip = data.trips.find(t => t.id === tripId), dive = trip && tripDives(trip).find(d => d.id === diveId);
  if (!trip || !dive) return <Screen><Copy>This dive is no longer inside the trip.</Copy></Screen>;
  const editing = route.params.edit === true;
  return <Screen><Text style={styles.title}>{editing ? 'Edit dive' : `Dive ${dive.sequence}`}</Text>
    <Copy>{diveLocalTime(dive, trip.config)} · {offsetLabel(diveOffset(dive, trip.config))}</Copy>
    <Text style={styles.small}>Source: {trip.files.find(f => f.id === dive.sourceFileId)?.name}</Text>
    <Copy>Garmin dive type: {dive.diveKind === 'freedive' ? 'Freediving' : dive.diveKind === 'ccr' ? 'CCR rebreather' : 'Scuba'}</Copy>
    <DiveQrReview key={dive.id} tripId={tripId} diveId={diveId} editing={editing} />
    {!editing && <PrimaryButton label="Edit dive" onPress={() => navigation.push('DiveDetail', { tripId, diveId, edit: true })} />}
    {(Object.keys(fieldLabels) as EditableField[]).map(field => <View key={field} style={{ gap: 2 }}>
      <Text style={styles.label}>{fieldLabels[field]}</Text>
      <Copy>{dive[field] === undefined || dive[field] === '' ? 'Missing' : field === 'durationSec' ? `${Math.floor(dive.durationSec! / 60)} min ${Number((dive.durationSec! % 60).toFixed(2))} sec` : String(dive[field])}</Copy>
      {field in dive.corrections && <Text style={styles.small}>Corrected locally</Text>}
      {editing && <PrimaryButton label={`Edit ${fieldLabels[field]}`} disabled={busy} onPress={() => navigation.navigate('FieldCorrection', { tripId, diveId, field })} />}
    </View>)}
    <PrimaryButton label={showMeasurements ? "Hide Garmin measurements" : "Additional Garmin measurements"} onPress={() => setShowMeasurements(!showMeasurements)} />
    {showMeasurements && <View style={styles.card}><Text style={styles.label}>Additional Garmin measurements</Text>
      {dive.maxWaterTempC !== undefined && <Copy>Maximum water temperature: {dive.maxWaterTempC} °C</Copy>}
      {Object.entries(dive.garminStats || {}).filter(([, value]) => value !== undefined).map(([key, value]) => <Copy key={key}>{({
        avgDepthM: 'Average depth (m)', surfaceIntervalSec: 'Surface interval (seconds)', latitude: 'Latitude', longitude: 'Longitude',
        avgHeartRateBpm: 'Average heart rate (bpm)', maxHeartRateBpm: 'Maximum heart rate (bpm)', endCnsPercent: 'CNS at end (%)', oxygenToxicityOtu: 'Oxygen toxicity (OTU)', waterType: 'Water type'
      } as Record<string, string>)[key] || key}: {typeof value === 'number' ? Number(value.toFixed(6)) : value}</Copy>)}
      <Text style={styles.small}>MySSI QR supports water temperature range and fresh/salt water type. GPS, average depth, surface interval, heart rate and oxygen exposure have no confirmed QR fields. Garmin GPS cannot identify an SSI dive-site database entry automatically.</Text>
    </View>}
  </Screen>;
}
export function FieldCorrectionScreen({ navigation, route }: Props<'FieldCorrection'>) {
  const { data, busy, run, correct } = useTrips(); const { tripId, diveId, field } = route.params;
  const trip = data.trips.find(t => t.id === tripId), original = trip?.dives.find(d => d.id === diveId), dive = original && effective(original);
  const [value, setValue] = useState(dive?.[field] === undefined ? '' : String(dive[field]));
  const [minutes, setMinutes] = useState(dive?.durationSec === undefined ? '' : String(Math.floor(dive.durationSec / 60)));
  const [seconds, setSeconds] = useState(dive?.durationSec === undefined ? '' : String(Number((dive.durationSec % 60).toFixed(2))));
  if (!dive) return <Screen><Copy>Dive no longer exists.</Copy></Screen>;
  const numeric = field !== 'locationName' && field !== 'notes';
  return <Screen><Text style={styles.title}>{fieldLabels[field]}</Text>
    {field === 'durationSec' ? <><Input label="Minutes" value={minutes} onChange={setMinutes} numeric /><Input label="Seconds (0 to less than 60)" value={seconds} onChange={setSeconds} numeric /></>
      : <Input label={fieldLabels[field]} value={value} onChange={setValue} numeric={numeric} multiline={!numeric} />}
    <Copy>{field === 'waterTempC' || !numeric ? 'Leave empty to clear this field.' : 'A valid measurement is required.'}</Copy>
    <PrimaryButton label="Save correction" disabled={busy} onPress={() => run(async () => {
      let updated: string | number | null;
      if (field === 'durationSec') {
        const m = Number(minutes || 0), s = Number(seconds || 0);
        if (!Number.isInteger(m) || m < 0 || !Number.isFinite(s) || s < 0 || s >= 60) throw new Error('Enter whole minutes and seconds from 0 to less than 60.');
        updated = m * 60 + s;
      } else updated = value.trim() === '' ? null : numeric ? Number(value) : value;
      await correct(tripId, diveId, field, updated); navigation.goBack();
    })} />
  </Screen>;
}

function DiveQrReview({ tripId, diveId, editing }: { tripId: string; diveId: string; editing: boolean }) {
  const { data, busy, run, saveSsiConditions, transactTrip, correct } = useTrips();
  const trip = data.trips.find(t => t.id === tripId)!, dive = tripDives(trip).find(d => d.id === diveId)!;
  const [values, setValues] = useState<SsiConditions>({ ...dive.ssiConditionOverrides });
  const [air, setAir] = useState(String(dive.ssiAirTempC ?? ''));
  const [zone, setZone] = useState(dive.timeZoneOverride || '');
  const [airDirty, setAirDirty] = useState(false);
  const [googleNames, setGoogleNames] = useState<string[]>([]), [googleMessage, setGoogleMessage] = useState('');
  const point = dive.enrichment?.coordinates;
  useEffect(() => {
    let active = true;
    if (point && !dive.locationName && !dive.enrichment?.candidates?.length) void googleFallback(point, !!dive.enrichment?.fallback).then(names => { if (active) setGoogleNames(names); }).catch(() => { if (active) setGoogleMessage('Optional Google lookup unavailable. You can enter the location manually.'); });
    return () => { active = false; };
  }, [point?.latitude, point?.longitude, dive.locationName, dive.enrichment?.checkedAt, dive.enrichment?.fallback]);
  let payload = '', payloadError = '';
  try { payload = ssiPayload({ ...dive, ssiAirTempC: ssiAirTemperature(dive, trip) }, trip.config, trip.ssiDefaults); }
  catch (e) { payloadError = e instanceof Error ? e.message : String(e); }
  const image = useMemo(() => {
    try { return payload ? { ...qrPng(payload), error: '' } : { base64: undefined, error: payloadError }; }
    catch (e) { return { base64: undefined, error: e instanceof Error ? e.message : String(e) }; }
  }, [payload, payloadError]);
  return <View style={styles.card}>
    {!editing && <><Text style={styles.label}>SSI QR preview</Text>
    {image.base64 ? <Image accessibilityLabel={`QR code for Dive ${dive.sequence}`} source={{ uri: `data:image/png;base64,${image.base64}` }} style={{ width: '100%', maxWidth: 400, aspectRatio: 1, alignSelf: 'center' }} resizeMode="contain" /> : <Text style={styles.error}>{image.error}</Text>}
    <Copy>Location: {dive.locationName || 'Not set'}</Copy><Copy>Air temperature: {ssiAirTemperature(dive, trip) ?? 'Unavailable'} �C</Copy><ConditionSummary values={dive.ssiConditionOverrides} recorded={dive.ssiConditions} defaults={trip.ssiDefaults} /></>}
    {editing && <>
    {dive.enrichment?.candidates?.map(candidate => <PrimaryButton key={candidate.name} label={`${candidate.name} · ${candidate.kind} · ${candidate.distanceM} m`} disabled={busy} onPress={() => run(() => correct(tripId, diveId, 'locationName', candidate.name))} />)}
    {!!googleNames.length && <><Text style={styles.label}>Google Maps</Text>{googleNames.map(name => <Copy key={name}>{name}</Copy>)}<Text style={styles.small}>Online reference only; Google names are not saved offline. Use Edit Location to enter your own correction.</Text></>}
    {!!googleMessage && <Copy>{googleMessage}</Copy>}
    <Copy>Local time: {diveLocalTime(dive, trip.config)} · {dive.timeZoneOverride || trip.config.timeZoneOverride || dive.enrichment?.timeZone || offsetLabel(trip.config.utcOffsetMinutes)}</Copy>
    <Text style={styles.small}>Original timestamp: {dive.recordedStartTime || dive.startTime}{dive.enrichment?.fallback ? ' · Using fallback coordinates' : ''}</Text>
    <Input label="Dive time zone correction (optional)" value={zone} onChange={setZone} />
    <PrimaryButton label="Save time zone correction" disabled={busy} onPress={() => run(async () => {
      if (zone.trim() && !validTimeZone(zone.trim())) throw new Error('Enter a geographic time zone, such as Asia/Singapore.');
      await transactTrip(tripId, async latest => ({ ...latest, dives: latest.dives.map(d => d.id === diveId ? { ...d, timeZoneOverride: zone.trim() || undefined } : d) }));
    })} />
    <ConditionEditor values={values} onChange={setValues} recorded={dive.ssiConditions} defaults={trip.ssiDefaults} />
    <Copy>Air temperature: {ssiAirTemperature(dive, trip) ?? 'Not set'} °C</Copy>
    <AirInput value={air} onChange={value => { setAir(value); setAirDirty(true); }} />
    <Copy>Clearing and saving air temperature omits it until you choose to use historical / trip temperature again.</Copy>
    <PrimaryButton label="Save dive QR conditions and air temperature" disabled={busy} onPress={() => run(async () => { await saveSsiConditions(tripId, diveId, values, parseAir(air), airDirty); setAirDirty(false); })} />
    <PrimaryButton label="Use historical / trip air temperature" disabled={busy} onPress={() => run(async () => { await transactTrip(tripId, async latest => ({ ...latest, dives: latest.dives.map(d => d.id === diveId ? { ...d, ssiAirTempC: undefined, airTempManual: false } : d) })); setAir(''); setAirDirty(false); })} />
    </>}
    {dive.enrichment?.errors?.map(error => <Text key={error} style={styles.small}>{error}</Text>)}
    <Text style={styles.small}>Location is optional. QR codes carry measurements and conditions; MySSI site selection stays in MySSI.</Text>
  </View>;
}
