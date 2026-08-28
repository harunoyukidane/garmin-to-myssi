import { DiveRecord } from "../../shared/types";
import { appendAuditEvent } from "../modules/audit-log";
import { reconcileTripDives } from "../modules/reconcile";
import { getTripOrThrow } from "./trips";
import { ServerlessRequest, ServerlessResponse } from "../types";

type ReconcileBody = {
  dives: DiveRecord[];
};

export async function reconcileTripHandler(
  request: ServerlessRequest<ReconcileBody, { tripId: string }>
): Promise<ServerlessResponse<DiveRecord[] | { error: string }>> {
  try {
    const trip = getTripOrThrow(request.params.tripId);
    const submittedDives = request.body !== undefined ? request.body.dives : [];
    const reconciled = reconcileTripDives(submittedDives, trip.config);

    appendAuditEvent("reconcile", {
      tripId: trip.id,
      divesSubmitted: submittedDives.length,
      divesMapped: reconciled.length,
      ssiStartDiveNumber: trip.config.ssiStartDiveNumber
    });

    return { statusCode: 200, body: reconciled };
  } catch (error) {
    return { statusCode: 400, body: { error: error instanceof Error ? error.message : "Reconcile failed." } };
  }
}
