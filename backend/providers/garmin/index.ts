import { DiveRecord, ImportResult } from "../../../shared/types";
import { parseGarminCsv } from "../../parsers/csv";
import { parseGarminFit } from "../../parsers/fit";

export type GarminImportFile = {
  name: string;
  body: string | Uint8Array;
};

export async function importGarminFiles(files: GarminImportFile[]): Promise<ImportResult> {
  const dives: DiveRecord[] = [];
  const unsupportedFiles: string[] = [];
  const parseFailures: Array<{ fileName: string; reason: string }> = [];

  for (const file of files) {
    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        dives.push(...parseGarminCsv(String(file.body)));
      } else if (file.name.toLowerCase().endsWith(".fit")) {
        dives.push(...parseGarminFit(file.body));
      } else {
        unsupportedFiles.push(file.name);
      }
    } catch (error) {
      parseFailures.push({
        fileName: file.name,
        reason: error instanceof Error ? error.message : "Unknown parse error"
      });
    }
  }

  return {
    importId: crypto.randomUUID(),
    dives,
    unsupportedFiles,
    parseFailures
  };
}

export async function fetchApprovedGarminPayload(): Promise<DiveRecord[]> {
  throw new Error("Garmin Connect API adapter requires approved developer access and user consent.");
}
