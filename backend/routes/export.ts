import { DiveRecord, ExportFormat } from "../../shared/types";
import { appendAuditEvent } from "../modules/audit-log";
import { generateExport } from "../modules/exporter";
import { mapToSsiReadyDives } from "../modules/ssi-mapper";
import { ServerlessRequest, ServerlessResponse } from "../types";

type ExportBody = {
  dives: DiveRecord[];
  format: ExportFormat;
};

export async function exportTripHandler(
  request: ServerlessRequest<ExportBody, { tripId: string }>
): Promise<ServerlessResponse> {
  const format = request.body !== undefined ? request.body.format : "csv";
  const mapped = mapToSsiReadyDives(request.body !== undefined ? request.body.dives : []);
  const result = generateExport(mapped, format);

  appendAuditEvent("export", {
    tripId: request.params.tripId,
    format,
    rows: mapped.length,
    rowsWithMissingFields: mapped.filter((dive) => dive.missingFields.length > 0).length
  });

  return { statusCode: 200, headers: { "Content-Type": result.contentType }, body: result };
}
