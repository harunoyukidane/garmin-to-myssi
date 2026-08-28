import { DiveRecord, SsiReadyDive } from "./types";

export function assignSsiDiveNumbers(dives: DiveRecord[], startNumber: number): DiveRecord[] {
  return dives.map((dive, index) => ({
    ...dive,
    ssiDiveNumber: startNumber + index
  }));
}

export function mapToSsiReadyDives(dives: DiveRecord[]): SsiReadyDive[] {
  return dives.map((dive) => {
    const missingFields = requiredMissingFields(dive);
    const start = new Date(dive.startTime);

    if (!dive.ssiDiveNumber) {
      missingFields.push("ssiDiveNumber");
    }

    return {
      sourceId: dive.sourceId,
      diveDate: start.toISOString().slice(0, 10),
      diveTime: start.toISOString().slice(11, 16),
      diveNumber: dive.ssiDiveNumber !== undefined ? dive.ssiDiveNumber : 0,
      maxDepth: dive.maxDepthM,
      bottomTime: dive.durationSec,
      waterTemp: dive.waterTempC,
      location: dive.locationName,
      notes: dive.notes,
      missingFields
    };
  });
}

function requiredMissingFields(dive: DiveRecord): string[] {
  const missing: string[] = [];

  if (dive.maxDepthM === undefined) {
    missing.push("maxDepthM");
  }

  if (dive.durationSec === undefined) {
    missing.push("durationSec");
  }

  if (!dive.locationName) {
    missing.push("locationName");
  }

  return missing;
}
