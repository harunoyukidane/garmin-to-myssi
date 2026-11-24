import { Trip } from './model';
import { tripDives } from './domain';
import { qrPng, ssiPayload, ssiAirTemperature } from './ssiQr';
import { SsiConditions } from './ssiConditions';
import { diveLocalTime } from './diveTime';

export type QrExportReport = { total: number; saved: number; cancelled: boolean; failures: Array<{ sequence: number; reason: string }> };
export type QrExportProgress = { processed: number; total: number; sequence: number };
export function qrFileName(sequence: number, startTime: string): string {
  return `ssi-dive-${String(sequence).padStart(6, '0')}-${startTime.replace(/[-:.]/g, '')}.png`;
}
export async function exportAllQr(
  trip: Trip,
  write: (fileName: string, base64: string, caption: string) => Promise<void>,
  onProgress: (progress: QrExportProgress) => void = () => undefined,
  shouldCancel: () => boolean = () => false,
  defaults?: SsiConditions
): Promise<QrExportReport> {
  const dives = tripDives(trip);
  const result: QrExportReport = { total: dives.length, saved: 0, cancelled: false, failures: [] };
  for (let i = 0; i < dives.length; i++) {
    if (shouldCancel()) { result.cancelled = true; break; }
    const dive = dives[i];
    onProgress({ processed: i, total: dives.length, sequence: dive.sequence });
    try {
      const { base64 } = qrPng(ssiPayload({ ...dive, ssiAirTempC: ssiAirTemperature(dive, trip) }, trip.config, trip.ssiDefaults ?? defaults));
      const caption = `Dive ${dive.sequence}\n${dive.locationName || 'Location unavailable'}\n${diveLocalTime(dive, trip.config)}\n${dive.maxDepthM?.toFixed(1)} m · ${Math.round(dive.durationSec! / 60)} min`;
      await write(qrFileName(dive.sequence, dive.startTime), base64, caption);
      result.saved++;
    } catch (error) { result.failures.push({ sequence: dive.sequence, reason: error instanceof Error ? error.message : String(error) }); }
    onProgress({ processed: i + 1, total: dives.length, sequence: dive.sequence });
  }
  return result;
}
