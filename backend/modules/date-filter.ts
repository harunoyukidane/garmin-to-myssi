import { DiveRecord, TripConfig } from "../../shared/types";

export function filterDivesByTripDate(dives: DiveRecord[], config: TripConfig): DiveRecord[] {
  const start = startOfUtcDate(config.tripStartDate);
  const end = endOfUtcDate(config.tripEndDate);

  return dives
    .filter((dive) => {
      const diveStart = Date.parse(dive.startTime);
      return !Number.isNaN(diveStart) && diveStart >= start && diveStart <= end;
    })
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

function startOfUtcDate(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function endOfUtcDate(date: string): number {
  return Date.parse(`${date}T23:59:59.999Z`);
}
