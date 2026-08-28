import { Trip, TripConfig } from "../../shared/types";
import { validateTripConfig } from "../../shared/validation";
import { ServerlessRequest, ServerlessResponse } from "../types";

const trips = new Map<string, Trip>();

export async function createTripHandler(request: ServerlessRequest<TripConfig>): Promise<ServerlessResponse<Trip | { errors: string[] }>> {
  const config = request.body;

  if (!config) {
    return { statusCode: 400, body: { errors: ["Trip config is required."] } };
  }

  const validation = validateTripConfig(config);

  if (!validation.valid) {
    return { statusCode: 400, body: { errors: validation.errors } };
  }

  const now = new Date().toISOString();
  const trip: Trip = {
    id: crypto.randomUUID(),
    config,
    importedDiveIds: [],
    createdAt: now,
    updatedAt: now
  };

  trips.set(trip.id, trip);
  return { statusCode: 201, body: trip };
}

export async function getTripHandler(request: ServerlessRequest<never, { tripId: string }>): Promise<ServerlessResponse<Trip | { error: string }>> {
  const trip = trips.get(request.params.tripId);

  if (!trip) {
    return { statusCode: 404, body: { error: "Trip not found." } };
  }

  return { statusCode: 200, body: trip };
}

export function getTripOrThrow(tripId: string): Trip {
  const trip = trips.get(tripId);

  if (!trip) {
    throw new Error("Trip not found.");
  }

  return trip;
}
