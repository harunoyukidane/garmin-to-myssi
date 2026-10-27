export type TripConfig = {
  tripStartDate: string;
  tripEndDate: string;
  ssiStartDiveNumber: number;
  utcOffsetMinutes: number;
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
  avgHeartRateBpm?: number; maxHeartRateBpm?: number;
  endCnsPercent?: number; oxygenToxicityOtu?: number;
  waterType?: 'fresh' | 'salt';
};
export type ImportedDive = Measurements & { sourceId?: string; startTime: string; diveKind?: 'scuba' | 'freedive' | 'ccr'; garminStats?: GarminStats; };
export type Dive = ImportedDive & {
  id: string;
  sourceFileId: string;
  ssiMarkedSavedAt?: string;
  ssiTypeOverride?: number;
  original: Measurements;
  corrections: Partial<Record<EditableField, string | number | null>>;
};
export type SourceFile = { id: string; name: string; uri: string; importedAt: string; fingerprint: string; };
export type Audit = { diveId: string; field: EditableField; before: string | number | null; after: string | number | null; at: string; };
export type Trip = { id: string; config: TripConfig; dives: Dive[]; files: SourceFile[]; audit: Audit[]; createdAt: string; updatedAt: string; };
export type Store = { schemaVersion: 1; trips: Trip[]; };
export type NumberedDive = Dive & { ssiDiveNumber: number; };
export type ImportReport = { accepted: number; duplicates: number; outsideTrip: number; failures: string[]; conflicts: string[]; uncertain?: number; };
export type CsvMapping = {
  start: string; id?: string; duration?: string; depth?: string; temperature?: string; location?: string; notes?: string;
  durationUnit: 'seconds' | 'minutes' | 'clock'; depthUnit: 'm' | 'ft'; temperatureUnit: 'C' | 'F';
};
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export const emptyStore = (): Store => ({ schemaVersion: 1, trips: [] });
