import { DiveRecord } from "../../shared/types";

export type GarminSourceRecord = {
  id: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  maxDepthMeters?: number;
  averageDepthMeters?: number;
  waterTemperatureCelsius?: number;
  location?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  raw: unknown;
};

export function normalizeGarminRecord(record: GarminSourceRecord): DiveRecord {
  return {
    source: "garmin",
    sourceId: record.id,
    startTime: record.startedAt,
    endTime: record.endedAt,
    durationSec: record.durationSeconds,
    maxDepthM: record.maxDepthMeters,
    avgDepthM: record.averageDepthMeters,
    waterTempC: record.waterTemperatureCelsius,
    locationName: record.location,
    gps: record.latitude !== undefined && record.longitude !== undefined ? { lat: record.latitude, lon: record.longitude } : undefined,
    notes: record.notes,
    raw: record.raw
  };
}
