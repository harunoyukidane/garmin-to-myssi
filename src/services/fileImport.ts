import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { CsvMapping, ImportReport, Trip, newId } from '../../shared/model';
import { mergeDives } from '../../shared/domain';
import { csvRows, parseCsv, suggestMapping } from '../../shared/parsers/csv';
import { parseFit } from '../../shared/parsers/fit';
import { base64Bytes } from '../../shared/domain';
import { appDirectory } from './localStore';

export type SelectedFile = { name: string; uri: string; size?: number };
export type PreparedFile = SelectedFile & { text?: string; headers?: string[]; mapping?: CsvMapping; fingerprint: string };
export async function selectFiles(): Promise<SelectedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return [];
  return result.assets.map(a => ({ name: a.name, uri: a.uri, size: a.size }));
}
export async function prepareFile(file: SelectedFile): Promise<PreparedFile> {
  if (!/\.(csv|fit)$/i.test(file.name)) throw new Error(`${file.name}: only CSV and FIT files are supported.`);
  const info = await FileSystem.getInfoAsync(file.uri, { md5: true });
  if (!info.exists || info.isDirectory) throw new Error(`${file.name}: file is unavailable.`);
  if (info.size > 20 * 1024 * 1024) throw new Error(`${file.name}: exceeds the 20 MB per file limit.`);
  if (!info.md5) throw new Error('Could not identify the selected file. Try copying it to Downloads first.');
  const prepared: PreparedFile = { ...file, fingerprint: info.md5 };
  if (/\.csv$/i.test(file.name)) {
    const text = await FileSystem.readAsStringAsync(file.uri);
    const headers = csvRows(text)[0];
    if (!headers?.length) throw new Error('CSV is empty.');
    return { ...prepared, text, headers, mapping: suggestMapping(headers) };
  }
  return prepared;
}
export async function importFile(trip: Trip, file: PreparedFile, mapping?: CsvMapping, allowSameTime = false): Promise<{ trip: Trip; report: ImportReport; copiedUri?: string }> {
  const report: ImportReport = { accepted: 0, duplicates: 0, outsideTrip: 0, failures: [], conflicts: [] };
  // CSV mappings may change on retry; do not treat a file hash alone as an imported activity.
  const parsed = file.text !== undefined
    ? parseCsv(file.text, mapping || file.mapping!, trip.config.utcOffsetMinutes)
    : parseFit(base64Bytes(await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 })));
  report.failures = parsed.errors.map(message => `${file.name}: ${message}`);
  const id = newId();
  let next = mergeDives(trip, parsed.dives, id, report, allowSameTime);
  if (!parsed.dives.length && !report.failures.length) report.failures.push(`${file.name}: no supported dive activities found.`);
  if (!report.accepted) return { trip, report };
  const uri = `${appDirectory()}sources/${id}.${file.text !== undefined ? 'csv' : 'fit'}`;
  await FileSystem.copyAsync({ from: file.uri, to: uri });
  next = { ...next, files: [...next.files, { id, uri, name: file.name, importedAt: new Date().toISOString(), fingerprint: file.fingerprint }] };
  return { trip: next, report, copiedUri: uri };
}
