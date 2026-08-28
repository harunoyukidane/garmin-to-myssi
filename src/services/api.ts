import { DiveCorrection, DiveRecord, ExportFormat, ImportResult, Trip, TripConfig } from "../../shared/types";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL !== undefined ? process.env.EXPO_PUBLIC_API_BASE_URL : "http://localhost:8788";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined)
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function createTrip(config: TripConfig) {
  return request<Trip>("/trips", {
    method: "POST",
    body: JSON.stringify(config)
  });
}

export function importGarminFiles(fileRefs: Array<{ name: string; uri: string; mimeType?: string }>) {
  return request<ImportResult>("/garmin/import", {
    method: "POST",
    body: JSON.stringify({ files: fileRefs })
  });
}

export function reconcileTrip(tripId: string, dives: DiveRecord[]) {
  return request<DiveRecord[]>(`/trips/${tripId}/reconcile`, {
    method: "POST",
    body: JSON.stringify({ dives })
  });
}

export function patchDive(diveId: string, correction: DiveCorrection) {
  return request<DiveRecord>(`/dives/${diveId}`, {
    method: "PATCH",
    body: JSON.stringify(correction)
  });
}

export function exportTrip(tripId: string, format: ExportFormat) {
  return request<{ fileName: string; contentType: string; body: string }>(`/trips/${tripId}/export`, {
    method: "POST",
    body: JSON.stringify({ format })
  });
}
