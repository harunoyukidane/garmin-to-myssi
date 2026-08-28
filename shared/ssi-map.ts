export const ssiMap = {
  diveDate: "startTime",
  diveTime: "startTime",
  diveNumber: "ssiDiveNumber",
  maxDepth: "maxDepthM",
  bottomTime: "durationSec",
  waterTemp: "waterTempC",
  location: "locationName",
  notes: "notes"
} as const;

export type SsiMap = typeof ssiMap;
