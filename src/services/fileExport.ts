import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { generateExport } from '../../shared/domain';
import { Trip } from '../../shared/model';

export async function exportFile(trip: Trip, format: 'csv' | 'json', action: 'save' | 'share'): Promise<string> {
  const output = generateExport(trip, format);
  if (action === 'save') {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return 'Save canceled; no export was saved.';
    const uri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, output.fileName, output.mime);
    try { await FileSystem.writeAsStringAsync(uri, output.body); }
    catch (e) { await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined); throw e; }
    return `Saved ${output.fileName}`;
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable. Use Save to folder instead.');
  if (!FileSystem.cacheDirectory) throw new Error('Temporary storage is unavailable. Use Save to folder instead.');
  const uri = FileSystem.cacheDirectory + output.fileName;
  await FileSystem.writeAsStringAsync(uri, output.body);
  // Keep the file until the receiver has read it; Android may consume it after this promise resolves.
  await Sharing.shareAsync(uri, { mimeType: output.mime, dialogTitle: 'Share dive review' });
  return 'Share sheet closed. Check your chosen destination to confirm delivery.';
}
