import { appendAuditEvent } from "../modules/audit-log";
import { GarminImportFile, importGarminFiles } from "../providers/garmin";
import { ServerlessRequest, ServerlessResponse } from "../types";

type GarminImportBody = {
  files: GarminImportFile[];
};

export async function garminImportHandler(request: ServerlessRequest<GarminImportBody>): Promise<ServerlessResponse> {
  const files = request.body !== undefined ? request.body.files : [];
  const result = await importGarminFiles(files);

  appendAuditEvent("import", {
    fileCount: files.length,
    divesFound: result.dives.length,
    unsupportedFiles: result.unsupportedFiles.length,
    parseFailures: result.parseFailures.length
  });

  return { statusCode: 200, body: result };
}
