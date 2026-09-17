/**
 * Where the create-scorecard flow's paid work survives navigation.
 *
 * Extraction costs tokens, but its result used to live only in component
 * state — stepping out to fetch a missing document (or following the billing
 * link the flow itself offers) threw away everything the tokens had bought.
 * The snapshot is written the moment extraction completes and restored on the
 * next mount, so leaving and returning lands on the same reveal, not an empty
 * uploader. Session-scoped: it belongs to this tab's run, and creating the
 * scorecard (or discarding) removes it.
 *
 * Lives in its own module (not inside DocumentUploadStart) so light pages —
 * the Hub's "continue where you left off" strip — can peek at it without
 * pulling the whole upload component into their bundle.
 */
import type { ParserCaseLike } from "@/lib/parserWorkbookMap";

const FLOW_SNAPSHOT_KEY = "okiru-create-scorecard-flow-v1";

export interface FlowSnapshot {
  savedAt: string;
  companyName: string;
  sector: string;
  subSector: string;
  size: string;
  fileNames: string[];
  filedBatchByFile: Record<string, string>;
  /** Library ids of the persisted uploads, so create can still file them under the company. */
  documentIds: string[];
  parserCase: ParserCaseLike;
}

export function readFlowSnapshot(): FlowSnapshot | null {
  try {
    const raw = sessionStorage.getItem(FLOW_SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as FlowSnapshot;
    return snap && typeof snap === "object" && snap.parserCase ? snap : null;
  } catch {
    return null;
  }
}

export function writeFlowSnapshot(snapshot: FlowSnapshot): void {
  try {
    sessionStorage.setItem(FLOW_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota or private mode. The parser runs are still in the document
    // library; losing only the convenience restore is the acceptable failure.
  }
}

export function clearFlowSnapshot(): void {
  try {
    sessionStorage.removeItem(FLOW_SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}
