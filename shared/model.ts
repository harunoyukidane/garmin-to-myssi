import type { SsiConditions } from './ssiConditions';
export type TripConfig = {
  tripStartDate: string;
  tripEndDate: string;
  /** Legacy field, ignored. */
  ssiStartDiveNumber?: number;
  utcOffsetMinutes: number;
  destination?: string;
  destinationCoordinates?: Coordinates;
  destinationTimeZone?: string;
  timeZoneOverride?: string;
};
export type EditableField = 'maxDepthM' | 'durationSec' | 'waterTempC' | 'locationName' | 'notes';
export type Measurements = {
  durationSec?: number;
  maxDepthM?: number;
  waterTempC?: number;
  maxWaterTempC?: number;
  locationName?: string;
  notes?: string;
};
export type GarminStats = {
  avgDepthM?: number; surfaceIntervalSec?: number;
  latitude?: number; longitude?: number;
  entryLatitude?: number; entryLongitude?: number;
  exitLatitude?: number; exitLongitude?: number;
  avgHeartRateBpm?: number; maxHeartRateBpm?: number;
  endCnsPercent?: number; oxygenToxicityOtu?: number;
  waterType?: 'fresh' | 'salt';
};
export type Coordinates = { latitude: number; longitude: number };
export type LocationCandidate = { name: string; kind: string; distanceM: number; broad: boolean };
export type Enrichment = { locationName?: string; candidates?: LocationCandidate[]; timeZone?: string; airTempC?: number; weatherHour?: string; coordinates?: Coordinates; fallback?: boolean; checkedAt?: string; errors?: string[] };
export type ImportedDive = Measurements & { sourceId?: string; startTime: string; recordedStartTime?: string; sourceLocalTime?: string; enrichment?: Enrichment; timeZoneOverride?: string; diveKind?: 'scuba' | 'freedive' | 'ccr'; garminStats?: GarminStats; ssiConditions?: SsiConditions; garmin?: GarminOrigin & { diveId: string } };
export type Dive = ImportedDive & {
  id: string;
  sourceFileId: string;
  ssiMarkedSavedAt?: string;
  ssiTypeOverride?: number;
  ssiConditionOverrides?: SsiConditions;
  ssiAirTempC?: number;
  airTempManual?: boolean;
  original: Measurements;
  corrections: Partial<Record<EditableField, string | number | null>>;
};
export type GarminOrigin = { accountId: string; activityId: string };
export type SourceFile = { id: string; name: string; uri: string; importedAt: string; fingerprint: string; garmin?: GarminOrigin };
export type SyncFailure = { activityId: string; date: string; reason: string };
export type SyncResult = { attemptedAt: string; completedAt?: string; accountId: string; added: number; duplicates: number; activities: number; failures: SyncFailure[]; conflicts: string[]; cancelled: boolean; queryFailed?: boolean };
export type Audit = { diveId: string; field: EditableField; before: string | number | null; after: string | number | null; at: string; };
export type Trip = { id: string; config: TripConfig; dives: Dive[]; files: SourceFile[]; audit: Audit[]; createdAt: string; updatedAt: string; enrichmentKey?: string; garminSync?: SyncResult; garminLastSuccess?: string; ssiDefaults?: SsiConditions; ssiAirTempC?: number };
export type Store = { schemaVersion: 2; trips: Trip[]; ssiDefaults?: SsiConditions; };
export type SequencedDive = Dive & { sequence: number; };
export type ImportReport = { accepted: number; duplicates: number; outsideTrip: number; failures: string[]; conflicts: string[]; uncertain?: number; };
export type CsvMapping = {
  start: string; id?: string; duration?: string; depth?: string; temperature?: string; location?: string; notes?: string;
  entryLatitude?: string; entryLongitude?: string; exitLatitude?: string; exitLongitude?: string; latitude?: string; longitude?: string;
  durationUnit: 'seconds' | 'minutes' | 'clock'; depthUnit: 'm' | 'ft'; temperatureUnit: 'C' | 'F';
};
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export const emptyStore = (): Store => ({ schemaVersion: 2, trips: [] });
