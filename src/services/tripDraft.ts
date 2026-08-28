import { DiveRecord, TripConfig } from "../../shared/types";

export const sampleTripConfig: TripConfig = {
  tripStartDate: "2026-05-23",
  tripEndDate: "2026-05-27",
  ssiStartDiveNumber: 42
};

export const sampleDives: DiveRecord[] = [
  {
    source: "garmin",
    sourceId: "garmin-1",
    startTime: "2026-05-23T08:30:00.000Z",
    durationSec: 2380,
    maxDepthM: 24.3,
    waterTempC: 28,
    locationName: "House Reef",
    raw: {}
  },
  {
    source: "garmin",
    sourceId: "garmin-2",
    startTime: "2026-05-24T10:15:00.000Z",
    durationSec: 2140,
    maxDepthM: 18.9,
    waterTempC: 29,
    locationName: "Drop Off",
    raw: {}
  }
];
