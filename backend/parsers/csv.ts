import { DiveRecord } from "../../shared/types";
import { normalizeGarminRecord } from "../modules/normalizer";

export function parseGarminCsv(csv: string): DiveRecord[] {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);

  if (!headerLine) {
    return [];
  }

  const headers = splitCsvLine(headerLine);

  return lines.filter(Boolean).map((line, index) => {
    const values = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] !== undefined ? values[headerIndex] : ""]));

    return normalizeGarminRecord({
      id: row.id || row.activityId || `csv-${index + 1}`,
      startedAt: row.startTime || row.startedAt || row.date,
      durationSeconds: numberOrUndefined(row.durationSec || row.durationSeconds || row.bottomTime),
      maxDepthMeters: numberOrUndefined(row.maxDepthM || row.maxDepthMeters || row.maxDepth),
      waterTemperatureCelsius: numberOrUndefined(row.waterTempC || row.waterTemperatureCelsius || row.waterTemp),
      location: row.locationName || row.location,
      notes: row.notes,
      raw: row
    });
  });
}

function numberOrUndefined(value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}
