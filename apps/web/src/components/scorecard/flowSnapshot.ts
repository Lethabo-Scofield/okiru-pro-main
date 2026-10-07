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
  /** Financial year-end as yyyy-mm-dd. Optional: snapshots written before it existed lack it. */
  yearEnd?: string;
  fileNames: string[];
  filedBatchByFile: Record<string, string>;
  /** Library ids of the persisted uploads, so create can still file them under the company. */
  documentIds: string[];
  /** Library id per file name — the review's preview once the uploads themselves are gone. */
  documentIdsByName?: Record<string, string>;
  parserCase: ParserCaseLike;
}

/**
 * `scope` keeps separate runs apart: adding documents to an existing company
 * (scope `add:<companyId>`) must never restore into — or overwrite — a new
 * company's create flow in the same tab. No scope is the create flow.
 */
const keyFor = (scope?: string) => (scope ? `${FLOW_SNAPSHOT_KEY}:${scope}` : FLOW_SNAPSHOT_KEY);

export function readFlowSnapshot(scope?: string): FlowSnapshot | null {
  try {
    const raw = sessionStorage.getItem(keyFor(scope));
    if (!raw) return null;
    const snap = JSON.parse(raw) as FlowSnapshot;
    return snap && typeof snap === "object" && snap.parserCase ? snap : null;
  } catch {
    return null;
  }
}

export function writeFlowSnapshot(snapshot: FlowSnapshot, scope?: string): void {
  try {
    sessionStorage.setItem(keyFor(scope), JSON.stringify(snapshot));
  } catch {
    // Quota or private mode. The parser runs are still in the document
    // library; losing only the convenience restore is the acceptable failure.
  }
}

export function clearFlowSnapshot(scope?: string): void {
  try {
    sessionStorage.removeItem(keyFor(scope));
  } catch {
    // ignore
  }
}
