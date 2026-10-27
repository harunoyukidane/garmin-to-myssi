import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { NumberedDive, Trip, TripConfig } from '../../shared/model';
import { qrPng, ssiPayload } from '../../shared/ssiQr';
import { exportAllQr, qrFileName, QrExportProgress, QrExportReport } from '../../shared/qrBatch';
import { prepareGallery, writeGalleryImage } from './gallery';

async function writeFolderImage(directory: string, name: string, base64: string) {
  const uri = await FileSystem.StorageAccessFramework.createFileAsync(directory, name, 'image/png');
  try { await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 }); }
  catch (e) { await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined); throw e; }
}
export async function saveQrImage(dive: NumberedDive, config: TripConfig, action: 'save' | 'share' | 'gallery', diveType?: number): Promise<string> {
  const { base64 } = qrPng(ssiPayload(dive, config, diveType));
  const name = qrFileName(dive.ssiDiveNumber, dive.startTime);
  if (action === 'gallery') {
    await prepareGallery(); await writeGalleryImage(name, base64);
    return `Saved ${name} to the Dive Log Transfer gallery album. In MySSI, choose this image from the gallery.`;
  }
  if (action === 'save') {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return 'Save canceled.';
    await writeFolderImage(permission.directoryUri, name, base64);
    return `Saved ${name}. Select this QR image in MySSI.`;
  }
  if (!await Sharing.isAvailableAsync() || !FileSystem.cacheDirectory) throw new Error('Sharing unavailable. Use Save QR image instead.');
  const uri = FileSystem.cacheDirectory + name;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share MySSI QR image' });
  return 'Share sheet closed. Import the QR image in MySSI; this app cannot confirm that the dive was saved there.';
}
export async function exportTripQrImages(trip: Trip, destination: 'gallery' | 'folder', progress: (value: QrExportProgress) => void, cancelled: () => boolean): Promise<QrExportReport> {
  if (destination === 'gallery') {
    await prepareGallery();
    return exportAllQr(trip, writeGalleryImage, progress, cancelled);
  }
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return { total: 0, saved: 0, cancelled: true, failures: [] };
  return exportAllQr(trip, (name, base64) => writeFolderImage(permission.directoryUri, name, base64), progress, cancelled);
}
