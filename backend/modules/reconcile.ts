import { TripConfig, DiveRecord } from "../../shared/types";
import { validateTripConfig } from "../../shared/validation";
import { filterDivesByTripDate } from "./date-filter";
import { assignSsiDiveNumbers } from "./ssi-mapper";

export function reconcileTripDives(dives: DiveRecord[], config: TripConfig): DiveRecord[] {
  const validation = validateTripConfig(config);

  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const filtered = filterDivesByTripDate(removeDuplicateSourceIds(dives), config);
  return assignSsiDiveNumbers(filtered, config.ssiStartDiveNumber);
}

function removeDuplicateSourceIds(dives: DiveRecord[]): DiveRecord[] {
  const seen = new Set<string>();

  return dives.filter((dive) => {
    if (seen.has(dive.sourceId)) {
      return false;
    }

    seen.add(dive.sourceId);
    return true;
  });
}
