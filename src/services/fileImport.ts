import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { CsvMapping, GarminOrigin, ImportReport, Trip, newId } from '../../shared/model';
import { mergeDives } from '../../shared/domain';
import { archiveLimits, checkCancelled, extractArchive } from '../../shared/archive';
import { SyncStorageError } from '../../shared/garminSync';
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
export async function importFile(trip: Trip, file: PreparedFile, mapping?: CsvMapping, allowSameTime = false, origin?: GarminOrigin): Promise<{ trip: Trip; report: ImportReport; copiedUri?: string }> {
  const report: ImportReport = { accepted: 0, duplicates: 0, outsideTrip: 0, failures: [], conflicts: [] };
  // CSV mappings may change on retry; do not treat a file hash alone as an imported activity.
  const parsed = file.text !== undefined
    ? parseCsv(file.text, mapping || file.mapping!, trip.config.utcOffsetMinutes)
    : parseFit(base64Bytes(await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 })));
  report.failures = parsed.errors.map(message => `${file.name}: ${message}`);
  const id = newId();
  if (origin && parsed.errors.length) throw new Error('Activity FIT contains unsupported or invalid dive records. Import its original file manually to review.');
  const records = origin ? parsed.dives.map((d, i) => ({ ...d, garmin: { ...origin, diveId: `${file.name}:${i}` } })) : parsed.dives;
  let next = mergeDives(trip, records, id, report, allowSameTime);
  if (!origin && !parsed.dives.length && !report.failures.length) report.failures.push(`${file.name}: no supported dive activities found.`);
  if (!report.accepted) return { trip, report };
  const uri = `${appDirectory()}sources/${id}.${file.text !== undefined ? 'csv' : 'fit'}`;
  try { await FileSystem.copyAsync({ from: file.uri, to: uri }); }
  catch { throw new SyncStorageError('Storage copy failed. Check free space before importing again.'); }
  next = { ...next, files: [...next.files, { id, uri, name: file.name, importedAt: new Date().toISOString(), fingerprint: file.fingerprint, garmin: origin }] };
  return { trip: next, report, copiedUri: uri };
}

export function bytesBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let text = '';
  for (let i = 0; i < bytes.length; i += 3) { const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2]; const n = (a << 16) | ((b || 0) << 8) | (c || 0); text += alphabet[n >>> 18] + alphabet[(n >>> 12) & 63] + (b === undefined ? '=' : alphabet[(n >>> 6) & 63]) + (c === undefined ? '=' : alphabet[n & 63]); }
  return text;
}
export async function temporarySources(bytes: Uint8Array, name: string, signal?: AbortSignal) {
  if (!FileSystem.cacheDirectory) throw new Error('Temporary storage is unavailable.');
  const root = `${FileSystem.cacheDirectory}garmin-${newId()}/`;
  const cleanup = () => FileSystem.deleteAsync(root, { idempotent: true });
  try { await FileSystem.makeDirectoryAsync(root, { intermediates: true }); }
  catch { throw new SyncStorageError('Temporary storage is unavailable. Check free space before importing again.'); }
  try {
    const archive = /\.zip$/i.test(name) ? await extractArchive(bytes, signal) : { files: [{ name, bytes }], unsupported: [] };
    const files: SelectedFile[] = [];
    for (const [i, entry] of archive.files.entries()) {
      checkCancelled(signal);
      const extension = /\.csv$/i.test(entry.name) ? 'csv' : 'fit';
      const uri = `${root}${i}.${extension}`;
      try { await FileSystem.writeAsStringAsync(uri, bytesBase64(entry.bytes), { encoding: FileSystem.EncodingType.Base64 }); }
      catch { throw new SyncStorageError('Temporary storage write failed. Check free space before importing again.'); }
      files.push({ name: entry.name, uri, size: entry.bytes.length });
    }
    return { files, unsupported: archive.unsupported, cleanup };
  } catch (e) { await cleanup(); throw e; }
}
export async function expandSelected(file: SelectedFile, signal?: AbortSignal) {
  if (!/\.zip$/i.test(file.name)) return { files: [file], unsupported: [] as string[], cleanup: async () => undefined };
  const info = await FileSystem.getInfoAsync(file.uri);
  if (!info.exists || info.isDirectory || info.size > archiveLimits.compressed) throw new Error('ZIP is unavailable or exceeds 32 MB.');
  return temporarySources(base64Bytes(await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 })), file.name, signal);
}
