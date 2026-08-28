import { TripConfig } from "./types";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateTripConfig(config: TripConfig): ValidationResult {
  const errors: string[] = [];
  const start = Date.parse(config.tripStartDate);
  const end = Date.parse(config.tripEndDate);

  if (!config.tripStartDate || Number.isNaN(start)) {
    errors.push("Trip start date is required.");
  }

  if (!config.tripEndDate || Number.isNaN(end)) {
    errors.push("Trip end date is required.");
  }

  if (!Number.isInteger(config.ssiStartDiveNumber) || config.ssiStartDiveNumber <= 0) {
    errors.push("SSI starting dive number must be an integer greater than 0.");
  }

  if (!Number.isNaN(start) && !Number.isNaN(end) && start > end) {
    errors.push("Trip start date must be before or equal to trip end date.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
