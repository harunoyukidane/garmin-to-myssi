import { DiveCorrection, DiveRecord } from "../../shared/types";
import { appendAuditEvent } from "../modules/audit-log";
import { ServerlessRequest, ServerlessResponse } from "../types";

type PatchDiveBody = DiveCorrection & {
  dive: DiveRecord;
};

export async function patchDiveHandler(
  request: ServerlessRequest<PatchDiveBody, { diveId: string }>
): Promise<ServerlessResponse<DiveRecord | { error: string }>> {
  const body = request.body;

  if (body === undefined || !body.dive) {
    return { statusCode: 400, body: { error: "Dive and correction payload are required." } };
  }

  const correctedDive = {
    ...body.dive,
    [body.field]: body.value
  };

  appendAuditEvent("correction", {
    diveId: request.params.diveId,
    field: body.field
  });

  return { statusCode: 200, body: correctedDive };
}
