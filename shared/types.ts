export type SourceKind = "garmin";

export type TripConfig = {
  tripStartDate: string;
  tripEndDate: string;
  ssiStartDiveNumber: number;
};

export type DiveGps = {
  lat: number;
  lon: number;
};

export type DiveRecord = {
  source: SourceKind;
  sourceId: string;
  startTime: string;
  endTime?: string;
  durationSec?: number;
  maxDepthM?: number;
  avgDepthM?: number;
  waterTempC?: number;
  tankPressureStart?: number;
  tankPressureEnd?: number;
  locationName?: string;
  gps?: DiveGps;
  notes?: string;
  raw: unknown;
  ssiDiveNumber?: number;
};

export type DiveCorrection = {
  diveId: string;
  field: keyof Pick<DiveRecord, "durationSec" | "maxDepthM" | "locationName" | "waterTempC" | "notes">;
  value: string | number;
  correctedAt: string;
};

export type SsiReadyDive = {
  sourceId: string;
  diveDate: string;
  diveTime: string;
  diveNumber: number;
  maxDepth?: number;
  bottomTime?: number;
  waterTemp?: number;
  location?: string;
  notes?: string;
  missingFields: string[];
};

export type Trip = {
  id: string;
  config: TripConfig;
  importedDiveIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ImportResult = {
  importId: string;
  dives: DiveRecord[];
  unsupportedFiles: string[];
  parseFailures: Array<{ fileName: string; reason: string }>;
};

export type ExportFormat = "csv" | "json" | "pdf";
