import { Trip } from '../../shared/model';
import { exportAllQr, QrExportProgress, QrExportReport } from '../../shared/qrBatch';
import { prepareGallery, writeGalleryImage } from './gallery';

export async function exportTripQrImages(trip: Trip, progress: (value: QrExportProgress) => void, cancelled: () => boolean): Promise<QrExportReport> {
  await prepareGallery();
  return exportAllQr(trip, writeGalleryImage, progress, cancelled);
}
