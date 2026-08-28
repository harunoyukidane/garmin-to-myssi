import { DiveRecord } from "../../shared/types";

export function parseGarminFit(_body: string | Uint8Array): DiveRecord[] {
  throw new Error("FIT parsing scaffold only. Add a FIT SDK parser here for production ingestion.");
}
