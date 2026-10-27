import { Trip } from './model';
import { tripDives } from './domain';
import { qrPng, ssiPayload } from './ssiQr';

export type QrExportReport = { total: number; saved: number; cancelled: boolean; failures: Array<{ diveNumber: number; reason: string }> };
export type QrExportProgress = { processed: number; total: number; diveNumber: number };
export function qrFileName(diveNumber: number, startTime: string): string {
  return `ssi-dive-${String(diveNumber).padStart(6, '0')}-${startTime.replace(/[-:.]/g, '')}.png`;
}
export async function exportAllQr(
  trip: Trip,
  write: (fileName: string, base64: string) => Promise<void>,
  onProgress: (progress: QrExportProgress) => void = () => undefined,
  shouldCancel: () => boolean = () => false
): Promise<QrExportReport> {
  const dives = tripDives(trip);
  const result: QrExportReport = { total: dives.length, saved: 0, cancelled: false, failures: [] };
  for (let i = 0; i < dives.length; i++) {
    if (shouldCancel()) { result.cancelled = true; break; }
    const dive = dives[i];
    onProgress({ processed: i, total: dives.length, diveNumber: dive.ssiDiveNumber });
    try {
      const { base64 } = qrPng(ssiPayload(dive, trip.config));
      await write(qrFileName(dive.ssiDiveNumber, dive.startTime), base64);
      result.saved++;
    } catch (error) { result.failures.push({ diveNumber: dive.ssiDiveNumber, reason: error instanceof Error ? error.message : String(error) }); }
    onProgress({ processed: i + 1, total: dives.length, diveNumber: dive.ssiDiveNumber });
  }
  return result;
}
