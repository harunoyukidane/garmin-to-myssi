import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QrExportReport } from '../../shared/qrBatch';
import { qrPng, ssiPayload } from '../../shared/ssiQr';
import { exportTripQrImages, saveQrImage } from '../services/ssiTransfer';
import { fitLicense, qrLicense } from '../../shared/fitLicense';
import { Alert, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { RootStackParamList } from '../navigation/types';
import { useTrips } from '../state/TripProvider';
import { CsvMapping, EditableField, ImportReport, TripConfig } from '../../shared/model';
import { effective, localDateTime, missingFields, offsetLabel, tripDives, validateConfig } from '../../shared/domain';
import { importFile, PreparedFile, prepareFile, SelectedFile, selectFiles } from '../services/fileImport';
import { exportFile } from '../services/fileExport';

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
  return <Screen><Text style={styles.title}>Your dive trips</Text>
    <Copy>Import Garmin files and turn dives into MySSI QR codes. Processing stays on this phone.</Copy>
    <PrimaryButton label="Create trip" disabled={busy} onPress={() => navigation.navigate('TripSetup')} />
    {!data.trips.length && <Copy>No trips yet. Create one, then select Garmin CSV or FIT files from your phone.</Copy>}
    {[...data.trips].reverse().map(trip => <View key={trip.id} style={styles.card}>
      <Text style={styles.label}>{trip.config.tripStartDate} – {trip.config.tripEndDate}</Text>
      <Copy>{tripDives(trip).length} dives · starts at SSI #{trip.config.ssiStartDiveNumber}</Copy>
      <PrimaryButton label="Open trip" disabled={busy} onPress={() => navigation.navigate('DiveList', { tripId: trip.id })} />
      <PrimaryButton label="Delete trip" disabled={busy} onPress={() => Alert.alert('Delete trip?', 'This removes the trip and its imported source files from this phone. Files already exported elsewhere are kept.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => run(() => removeTrip(trip.id)) }
      ])} />
    </View>)}
    <Text style={styles.small}>Uninstalling the app or clearing its data removes saved trips. Export files you want to keep. QR codes transfer dive measurements; CSV and JSON are optional review copies.</Text>
    <PrimaryButton label={showLicense ? 'Hide third-party licenses' : 'Third-party licenses'} onPress={() => setShowLicense(!showLicense)} />
    {showLicense && <Text selectable style={styles.small}>{fitLicense}{'\n\n'}{qrLicense}</Text>}
  </Screen>;
}
export function TripSetupScreen({ navigation, route }: Props<'TripSetup'>) {
  const { data, busy, run, saveTrip } = useTrips();
  const tripId = route.params?.tripId;
  const existing = data.trips.find(t => t.id === tripId);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [start, setStart] = useState(existing?.config.tripStartDate || today), [end, setEnd] = useState(existing?.config.tripEndDate || today);
  const [number, setNumber] = useState(String(existing?.config.ssiStartDiveNumber || 1));
  const [offset, setOffset] = useState(String(existing?.config.utcOffsetMinutes ?? -new Date().getTimezoneOffset()));
  const config: TripConfig = { tripStartDate: start, tripEndDate: end, ssiStartDiveNumber: number.trim() ? Number(number) : NaN, utcOffsetMinutes: offset.trim() ? Number(offset) : NaN };
  const errors = validateConfig(config);
  function save() { run(async () => { const id = await saveTrip(config, tripId); navigation.replace('DiveList', { tripId: id }); }); }
  return <Screen><Text style={styles.title}>{existing ? 'Edit trip' : 'Create trip'}</Text>
    <Input label="Start date (YYYY-MM-DD)" value={start} onChange={setStart} />
    <Input label="End date (YYYY-MM-DD)" value={end} onChange={setEnd} />
    <Input label="First SSI dive number" value={number} onChange={setNumber} numeric />
    <Input label="Trip UTC offset in minutes" value={offset} onChange={setOffset} numeric />
    <Copy>{Number.isInteger(config.utcOffsetMinutes) ? offsetLabel(config.utcOffsetMinutes) : 'Enter a UTC offset'}. For Singapore use 480; for UTC use 0. Dates, times, and exports use this fixed offset. Create separate trips for changes in time zone or daylight saving.</Copy>
    {errors.map(e => <Text key={e} style={styles.error}>{e}</Text>)}
    <PrimaryButton label="Save trip" disabled={busy || !!errors.length} onPress={() => {
      if (existing) Alert.alert('Update trip settings?', 'Dates and offset can change which dives are included. Included dives will be numbered again from the first SSI number.', [ { text: 'Cancel', style: 'cancel' }, { text: 'Save', onPress: save } ]);
      else save();
    }} />
  </Screen>;
}
export function DiveListScreen({ navigation, route }: Props<'DiveList'>) {
  const { data, busy } = useTrips();
  const trip = data.trips.find(t => t.id === route.params.tripId);
  if (!trip) return <Screen><Copy>Trip no longer exists. Return to your trips.</Copy></Screen>;
  const dives = tripDives(trip);
  return <Screen><Text style={styles.title}>{trip.config.tripStartDate} – {trip.config.tripEndDate}</Text>
    <Copy>{dives.length} included · {trip.dives.length - dives.length} outside trip dates · {offsetLabel(trip.config.utcOffsetMinutes)}</Copy>
    <PrimaryButton label="Import Garmin files" disabled={busy} onPress={() => navigation.navigate('Import', { tripId: trip.id })} />
    <PrimaryButton label="Edit trip settings" disabled={busy} onPress={() => navigation.navigate('TripSetup', { tripId: trip.id })} />
    {!dives.length && <Copy>No dives inside these dates. Import files or adjust your trip dates.</Copy>}
    {dives.map(dive => <View key={dive.id} style={styles.card}>
      <Text style={styles.label}>SSI #{dive.ssiDiveNumber}</Text>
      <Copy>{localDateTime(dive.startTime, trip.config.utcOffsetMinutes)}</Copy>
      <Copy>{dive.locationName || 'Location missing'} · {dive.maxDepthM === undefined ? 'Depth missing' : `${dive.maxDepthM} m`}</Copy>
      {!!missingFields(dive).length && <Text style={styles.error}>Review: {missingFields(dive).join(', ')}</Text>}
      <PrimaryButton label="Review dive" disabled={busy} onPress={() => navigation.navigate('DiveDetail', { tripId: trip.id, diveId: dive.id })} />
    </View>)}
    <PrimaryButton label="Transfer dives to MySSI" disabled={busy || !dives.length} onPress={() => navigation.navigate('SsiTransfer', { tripId: trip.id })} />
    <PrimaryButton label="Export review files" disabled={busy || !dives.length} onPress={() => navigation.navigate('Export', { tripId: trip.id })} />
  </Screen>;
}
export function ImportScreen({ route }: Props<'Import'>) {
  const { data, busy, run, updateTrip } = useTrips();
  const trip = data.trips.find(t => t.id === route.params.tripId);
  const [queue, setQueue] = useState<SelectedFile[]>([]), [current, setCurrent] = useState<PreparedFile | undefined>();
  const [mapping, setMapping] = useState<CsvMapping | undefined>(), [report, setReport] = useState<ImportReport | undefined>();
  const [message, setMessage] = useState('');
  const [conflictFile, setConflictFile] = useState<{ file: PreparedFile; mapping?: CsvMapping }>();
  const [preparationError, setPreparationError] = useState('');
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
    <Copy>Select local .fit or .csv exports. Each file is saved when you tap Import this file. Maximum 20 MB per file.</Copy>
    <PrimaryButton label="Select files" disabled={busy || !!queue.length} onPress={() => run(async () => {
      const selected = await selectFiles(); if (!selected.length) return; setQueue(selected); setReport(undefined); setConflictFile(undefined); setMessage(''); await prepare(selected[0]);
    })} />
    {!!queue.length && <Copy>{queue.length} files remaining · {queue[0].name}</Copy>}
    {!!preparationError && <Text style={styles.error}>{preparationError}</Text>}
    {current && <View style={styles.card}>
      <Text style={styles.label}>{current.name}</Text>
      {current.headers && mapping && <>
        <Copy>Confirm column names and units. Copy names exactly from the list below. Leave optional fields empty if unavailable.</Copy>
        <Text selectable style={styles.small}>Columns: {current.headers.join(' | ')}</Text>
        <Input label="Start time column" value={mapping.start} onChange={v => mappingValue('start', v)} />
        {(['id', 'duration', 'depth', 'temperature', 'location', 'notes'] as const).map(key => <Input key={key} label={`${key} column (optional)`} value={mapping[key] || ''} onChange={v => mappingValue(key, v)} />)}
        <Copy>Duration unit: {mapping.durationUnit}</Copy>
        <View style={{ gap: 6 }}>{(['seconds', 'minutes', 'clock'] as const).map(unit => <PrimaryButton key={unit} label={unit === 'clock' ? 'Use mm:ss or hh:mm:ss' : `Use ${unit}`} disabled={busy || mapping.durationUnit === unit} onPress={() => mappingValue('durationUnit', unit)} />)}</View>
        <Copy>Depth unit: {mapping.depthUnit}</Copy><PrimaryButton label={mapping.depthUnit === 'm' ? 'Change to feet' : 'Change to metres'} disabled={busy} onPress={() => mappingValue('depthUnit', mapping.depthUnit === 'm' ? 'ft' : 'm')} />
        <Copy>Temperature unit: °{mapping.temperatureUnit}</Copy><PrimaryButton label={mapping.temperatureUnit === 'C' ? 'Change to Fahrenheit' : 'Change to Celsius'} disabled={busy} onPress={() => mappingValue('temperatureUnit', mapping.temperatureUnit === 'C' ? 'F' : 'C')} />
        <Copy>Times without a UTC offset will use {offsetLabel(trip.config.utcOffsetMinutes)}. Start time must be YYYY-MM-DD HH:mm[:ss]. Confirm that this matches the source file before importing.</Copy>
      </>}
      <PrimaryButton label="Import this file" disabled={busy || (!!mapping && !mapping.start)} onPress={() => run(async () => {
        const result = await importFile(trip, current, mapping);
        if (result.report.accepted) await updateTrip(result.trip);
        setConflictFile(result.report.uncertain ? { file: current, mapping } : undefined);
        setReport(result.report); setMessage(result.report.accepted ? 'Accepted dives saved on this phone.' : 'No new dives saved.'); await next();
      })} />
    </View>}
    {!!queue.length && <PrimaryButton label="Skip this file" disabled={busy} onPress={() => run(next)} />}
    {!!queue.length && <PrimaryButton label="Cancel remaining files" disabled={busy} onPress={() => { setQueue([]); setCurrent(undefined); setMapping(undefined); setPreparationError(''); }} />}
    {!!message && <Copy>{message}</Copy>}
    {report && <View style={styles.card}><Copy>Last file: {report.accepted} accepted, {report.duplicates} duplicates, {report.outsideTrip} accepted outside trip dates.</Copy>
      {report.failures.map((e, i) => <Text key={`failure-${i}`} selectable style={styles.error}>{e}</Text>)}
      {report.conflicts.map((e, i) => <Text key={`conflict-${i}`} selectable style={styles.error}>{e}</Text>)}
      {!!report.conflicts.length && <Copy>Conflicting records were skipped. Existing dives and corrections were kept.</Copy>}
      {conflictFile && !!report.uncertain && <PrimaryButton label="Import uncertain matches as separate dives" disabled={busy} onPress={() => Alert.alert('Keep both dives?', 'Only do this when the records at the same start time are different dives. Existing corrections will be preserved. This may change SSI numbering.', [ { text: 'Cancel', style: 'cancel' }, { text: 'Keep both', onPress: () => run(async () => { const result = await importFile(trip, conflictFile.file, conflictFile.mapping, true); if (result.report.accepted) await updateTrip(result.trip); setReport(result.report); setConflictFile(undefined); setMessage('Conflict resolution saved.'); }) } ])} />}
    </View>}
  </Screen>;
}
export function DiveDetailScreen({ navigation, route }: Props<'DiveDetail'>) {
  const { data, busy } = useTrips(); const { tripId, diveId } = route.params;
  const trip = data.trips.find(t => t.id === tripId), dive = trip && tripDives(trip).find(d => d.id === diveId);
  if (!trip || !dive) return <Screen><Copy>This dive is no longer inside the trip.</Copy></Screen>;
  return <Screen><Text style={styles.title}>SSI #{dive.ssiDiveNumber}</Text>
    <Copy>{localDateTime(dive.startTime, trip.config.utcOffsetMinutes)} · {offsetLabel(trip.config.utcOffsetMinutes)}</Copy>
    <Text style={styles.small}>Source: {trip.files.find(f => f.id === dive.sourceFileId)?.name}</Text>
    <PrimaryButton label="Show MySSI QR code" disabled={busy} onPress={() => navigation.navigate('SsiTransfer', { tripId, diveId })} />
    {(Object.keys(fieldLabels) as EditableField[]).map(field => <View key={field} style={styles.card}>
      <Text style={styles.label}>{fieldLabels[field]}</Text>
      <Copy>{dive[field] === undefined || dive[field] === '' ? 'Missing' : field === 'durationSec' ? `${Math.floor(dive.durationSec! / 60)} min ${Number((dive.durationSec! % 60).toFixed(2))} sec` : String(dive[field])}</Copy>
      {field in dive.corrections && <Text style={styles.small}>Corrected locally</Text>}
      <PrimaryButton label={`Edit ${fieldLabels[field]}`} disabled={busy} onPress={() => navigation.navigate('FieldCorrection', { tripId, diveId, field })} />
    </View>)}
    <View style={styles.card}><Text style={styles.label}>Additional Garmin measurements</Text>
      {dive.maxWaterTempC !== undefined && <Copy>Maximum water temperature: {dive.maxWaterTempC} °C</Copy>}
      {Object.entries(dive.garminStats || {}).filter(([, value]) => value !== undefined).map(([key, value]) => <Copy key={key}>{({
        avgDepthM: 'Average depth (m)', surfaceIntervalSec: 'Surface interval (seconds)', latitude: 'Latitude', longitude: 'Longitude',
        avgHeartRateBpm: 'Average heart rate (bpm)', maxHeartRateBpm: 'Maximum heart rate (bpm)', endCnsPercent: 'CNS at end (%)', oxygenToxicityOtu: 'Oxygen toxicity (OTU)', waterType: 'Water type'
      } as Record<string, string>)[key] || key}: {typeof value === 'number' ? Number(value.toFixed(6)) : value}</Copy>)}
      <Text style={styles.small}>Available values are preserved in CSV/JSON exports. MySSI QR supports water temperature range and fresh/salt water type. GPS, average depth, surface interval, heart rate and oxygen exposure have no confirmed QR fields. Garmin GPS cannot identify an SSI dive-site database entry automatically.</Text>
    </View>
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
export function ExportScreen({ route }: Props<'Export'>) {
  const { data, busy, run } = useTrips(); const [message, setMessage] = useState('');
  const trip = data.trips.find(t => t.id === route.params.tripId);
  if (!trip) return <Screen><Copy>Trip no longer exists.</Copy></Screen>;
  const dives = tripDives(trip), incomplete = dives.filter(d => missingFields(d).length);
  function output(format: 'csv' | 'json', action: 'save' | 'share') {
    const proceed = () => run(async () => { setMessage(''); setMessage(await exportFile(trip!, format, action)); });
    if (incomplete.length) Alert.alert('Export with missing fields?', `${incomplete.length} dives have missing review fields. Those values will remain empty in the export.`, [ { text: 'Cancel', style: 'cancel' }, { text: 'Export anyway', onPress: proceed } ]);
    else proceed();
  }
  return <Screen><Text style={styles.title}>Export dive review</Text><Copy>{dives.length} dives · {incomplete.length} need review</Copy>
    <Copy>CSV uses metres, Celsius, and decimal minutes. JSON preserves duration in seconds. Times use {offsetLabel(trip.config.utcOffsetMinutes)}.</Copy>
    <Copy>These files are optional review copies. Use Transfer dives to MySSI for QR import without retyping measurements. JSON exports are not a full backup of source files and edit history.</Copy>
    {incomplete.map(d => <Text key={d.id} style={styles.error}>SSI #{d.ssiDiveNumber}: {missingFields(d).join(', ')}</Text>)}
    {(['csv', 'json'] as const).map(format => <View key={format} style={styles.card}><Text style={styles.label}>{format.toUpperCase()}</Text>
      <PrimaryButton label={`Save ${format.toUpperCase()} to folder`} disabled={busy || !dives.length} onPress={() => output(format, 'save')} />
      <PrimaryButton label={`Share ${format.toUpperCase()}`} disabled={busy || !dives.length} onPress={() => output(format, 'share')} />
    </View>)}
    {!!message && <Text selectable style={styles.text}>{message}</Text>}
  </Screen>;
}

export function SsiTransferScreen({ navigation, route }: Props<'SsiTransfer'>) {
  const { data, busy, run, confirmSsiSaved, setSsiType } = useTrips();
  const trip = data.trips.find(t => t.id === route.params.tripId);
  const dives = trip ? tripDives(trip) : [];
  const [position, setPosition] = useState(() => Math.max(0, dives.findIndex(d => d.id === route.params.diveId)));
  const dive = dives[Math.min(position, Math.max(0, dives.length - 1))];
  const diveType = dive?.ssiTypeOverride;
  const cancelExport = useRef(false);
  const [batchActive, setBatchActive] = useState(false), [batchReport, setBatchReport] = useState<QrExportReport>();
  const [message, setMessage] = useState(''), [showTypes, setShowTypes] = useState(false);
  useEffect(() => { setMessage(''); setShowTypes(false); }, [dive?.id]);
  useEffect(() => () => { cancelExport.current = true; }, []);
  const image = useMemo<{ payload?: string; base64?: string; width?: number; error?: string }>(() => {
    if (!trip || !dive) return { error: 'No dives inside this trip to transfer.' };
    try { const payload = ssiPayload(dive, trip.config, diveType); return { payload, ...qrPng(payload) }; }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  }, [dive?.id, dive?.durationSec, dive?.maxDepthM, dive?.waterTempC, dive?.maxWaterTempC, dive?.garminStats?.waterType, dive?.startTime, dive?.diveKind, trip?.config.utcOffsetMinutes, diveType]);
  if (!trip || !dive) return <Screen><Copy>No dives inside this trip to transfer.</Copy></Screen>;
  const selectedType = diveType ?? (dive.diveKind === 'freedive' ? 6 : dive.diveKind === 'ccr' ? 8 : 0);
  const types = [{ id: 0, name: 'Scuba' }, { id: 2, name: 'Extended range' }, { id: 4, name: 'SCR rebreather' }, { id: 6, name: 'Freediving' }, { id: 8, name: 'CCR rebreather' }];
  const marked = dives.filter(d => d.ssiMarkedSavedAt).length;
  function exportAll(destination: 'gallery' | 'folder') {
    run(async () => {
      cancelExport.current = false; setBatchActive(true); setBatchReport(undefined);
      try {
        const result = await exportTripQrImages(trip!, destination, value => setMessage(`Exporting ${value.processed} of ${value.total} QR images · SSI #${value.diveNumber}`), () => cancelExport.current);
        setBatchReport(result); setMessage(`${result.saved} of ${result.total} QR images saved${result.cancelled ? ' · export stopped' : ''}. Open MySSI and choose each saved image from the gallery.`);
      } finally { setBatchActive(false); }
    });
  }
  return <Screen><Text style={styles.title}>Transfer to MySSI</Text>
    <Copy>Dive {Math.min(position + 1, dives.length)} of {dives.length} · expected SSI #{dive.ssiDiveNumber}</Copy>
    <Copy>{localDateTime(dive.startTime, trip.config.utcOffsetMinutes)} · {offsetLabel(trip.config.utcOffsetMinutes)}</Copy>
    <Copy>Type: {types.find(t => t.id === selectedType)?.name}. Depth {dive.maxDepthM ?? 'missing'} m · duration {dive.durationSec === undefined ? 'missing' : `${Math.round(dive.durationSec / 60)} min`} · water {dive.waterTempC === undefined ? 'not recorded' : `${dive.waterTempC} °C`}</Copy>
    {image.base64 ? <View style={{ alignItems: 'center', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8 }}>
      <Image accessibilityLabel={`MySSI dive QR code for expected dive number ${dive.ssiDiveNumber}`} source={{ uri: `data:image/png;base64,${image.base64}` }} style={{ width: '100%', maxWidth: 400, aspectRatio: 1 }} resizeMode="contain" />
    </View> : <Text style={styles.error}>{image.error}</Text>}
    <Copy>Save the codes to your gallery, then open MySSI’s QR scanner and select a saved image from the gallery. Review the populated dive and save it. Repeat for each image.</Copy>
    <Text style={styles.small}>The code supplies date, time, dive type, depth, duration, available minimum/maximum water temperature, and recorded fresh/salt water type. Other Garmin statistics and GPS remain available in the dive details and CSV/JSON exports. SSI location needs an SSI site ID; Garmin coordinates or free-text names cannot fill it through the known QR format. The code does not include a full depth profile, notes, buddy, or verification. MySSI assigns the final dive number; compare it with the expected number above.</Text>
    <View style={styles.card}><Text style={styles.label}>Export all {dives.length} dive QR codes</Text>
      <PrimaryButton label="Export all QR codes to gallery" disabled={busy} onPress={() => exportAll('gallery')} />
      <PrimaryButton label="Export all QR codes to a folder" disabled={busy} onPress={() => exportAll('folder')} />
      <Text style={styles.small}>One numbered PNG per included dive. Gallery exports appear in the Dive Log Transfer album. Exporting does not add the dives to MySSI; select each image there.</Text>
      {batchActive && <PrimaryButton label="Stop after current image" onPress={() => { cancelExport.current = true; setMessage('Stopping after the current image. Images already saved are kept.'); }} />}
      {batchReport?.failures.map(f => <Text key={f.diveNumber} style={styles.error}>SSI #{f.diveNumber}: {f.reason}</Text>)}
    </View>
    <PrimaryButton label="Save this QR to gallery" disabled={busy || !image.base64} onPress={() => run(async () => setMessage(await saveQrImage(dive, trip.config, 'gallery', diveType)))} />
    <PrimaryButton label="Save QR image" disabled={busy || !image.base64} onPress={() => run(async () => setMessage(await saveQrImage(dive, trip.config, 'save', diveType)))} />
    <PrimaryButton label="Share this QR image" disabled={busy || !image.base64} onPress={() => run(async () => setMessage(await saveQrImage(dive, trip.config, 'share', diveType)))} />
    <PrimaryButton label="Review or correct this dive" disabled={busy} onPress={() => navigation.navigate('DiveDetail', { tripId: trip.id, diveId: dive.id })} />
    <PrimaryButton label={showTypes ? 'Hide dive types' : 'Change SSI dive type'} disabled={busy} onPress={() => setShowTypes(!showTypes)} />
    {showTypes && types.map(type => <PrimaryButton key={type.id} label={type.name} disabled={busy || selectedType === type.id} onPress={() => run(() => setSsiType(trip.id, dive.id, type.id))} />)}
    {dive.ssiMarkedSavedAt ? <Copy>You marked this dive saved in MySSI.</Copy> : null}
    <PrimaryButton label={dive.ssiMarkedSavedAt ? 'Clear saved checkmark' : 'I saved this dive in MySSI'} disabled={busy || !image.base64} onPress={() => run(async () => {
      await confirmSsiSaved(trip.id, dive.id, !dive.ssiMarkedSavedAt);
      if (!dive.ssiMarkedSavedAt && position < dives.length - 1) setPosition(position + 1);
    })} />
    <Text style={styles.small}>{marked} of {dives.length} marked saved. This is your local checklist; it cannot check MySSI or prevent duplicate imports there. Editing a dive here does not update an existing MySSI entry.</Text>
    <PrimaryButton label="Previous dive" disabled={busy || position === 0} onPress={() => setPosition(Math.max(0, position - 1))} />
    <PrimaryButton label="Next dive" disabled={busy || position >= dives.length - 1} onPress={() => setPosition(position + 1)} />
    {!!message && <Text selectable style={styles.text}>{message}</Text>}
  </Screen>;
}
