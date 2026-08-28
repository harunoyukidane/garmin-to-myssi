import { ExportFormat, SsiReadyDive } from "../../shared/types";

export type ExportPayload = {
  fileName: string;
  contentType: string;
  body: string;
};

export function generateExport(dives: SsiReadyDive[], format: ExportFormat): ExportPayload {
  if (format === "json") {
    return {
      fileName: "ssi-dive-review.json",
      contentType: "application/json",
      body: JSON.stringify(dives, null, 2)
    };
  }

  if (format === "pdf") {
    return {
      fileName: "ssi-dive-summary.txt",
      contentType: "text/plain",
      body: renderTextSummary(dives)
    };
  }

  return {
    fileName: "ssi-dive-export.csv",
    contentType: "text/csv",
    body: renderCsv(dives)
  };
}

function renderCsv(dives: SsiReadyDive[]): string {
  const headers = ["diveNumber", "diveDate", "diveTime", "maxDepth", "bottomTime", "waterTemp", "location", "notes"];
  const rows = dives.map((dive) =>
    [
      dive.diveNumber,
      dive.diveDate,
      dive.diveTime,
      dive.maxDepth !== undefined ? dive.maxDepth : "",
      dive.bottomTime !== undefined ? dive.bottomTime : "",
      dive.waterTemp !== undefined ? dive.waterTemp : "",
      dive.location !== undefined ? dive.location : "",
      dive.notes !== undefined ? dive.notes : ""
    ].map(csvCell).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

function renderTextSummary(dives: SsiReadyDive[]): string {
  return dives
    .map((dive) => `SSI #${dive.diveNumber} ${dive.diveDate} ${dive.diveTime} ${dive.location !== undefined ? dive.location : "Location missing"}`)
    .join("\n");
}

function csvCell(value: string | number): string {
  const text = String(value);
  return text.includes(",") || text.includes("\"") || text.includes("\n") ? `"${text.replace(/"/g, "\"\"")}"` : text;
}
