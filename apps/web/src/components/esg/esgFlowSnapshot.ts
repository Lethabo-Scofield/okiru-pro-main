/**
 * Where the ESG create flow's paid extraction survives navigation.
 *
 * Reading documents costs tokens, but the result used to live only in
 * component state — leaving `/esg` after extraction threw away everything the
 * tokens had bought. Two writers, one reader:
 *
 *   - `EsgDocumentUploadStart` writes the moment extraction completes, so the
 *     result survives even if the user never presses "continue to workbook".
 *   - `EsgCreateFlow.handleParsedDocuments` overwrites with the proposed
 *     entity name once the user does continue.
 *   - `EsgCreateFlow` restores on mount (straight to the review step), and
 *     clears when the company is created or the user goes back to the start.
 *
 * Only the documents route is snapshotted: the Excel and manual routes cost
 * nothing to redo. Session-scoped — it belongs to this tab's run.
 */
import type { EsgNameSource } from "./EsgCreateReview";
import type {
  EsgInjectionResult,
  EsgParserCaseLike,
  EsgSectionPatches,
} from "./esgParserInjection";
import {
  clearPendingReadRecord,
  readPendingReadRecord,
  writePendingReadRecord,
  type PendingRead,
} from "@/lib/paidReadResume";

const ESG_FLOW_SNAPSHOT_KEY = "okiru-esg-create-flow-v1";

/** Structurally matches EsgCreateFlow's PendingWork for the documents route. */
export interface EsgSnapshotWork {
  route: "documents";
  patches: EsgSectionPatches;
  injection: EsgInjectionResult | null;
  parserCase: EsgParserCaseLike | null;
  /** Library ids of the persisted uploads — filed under the company on create. */
  documentIds?: string[];
  excel: null;
}

export interface EsgFlowSnapshot {
  savedAt: string;
  entityName: string;
  nameSource: EsgNameSource;
  work: EsgSnapshotWork;
}

export function readEsgFlowSnapshot(): EsgFlowSnapshot | null {
  try {
    const raw = sessionStorage.getItem(ESG_FLOW_SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as EsgFlowSnapshot;
    return snap && typeof snap === "object" && snap.work?.route === "documents" ? snap : null;
  } catch {
    return null;
  }
}

export function writeEsgFlowSnapshot(snapshot: EsgFlowSnapshot): void {
  try {
    sessionStorage.setItem(ESG_FLOW_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota or private mode — the parser runs are still in the document
    // library; only the convenience restore is lost.
  }
}

export function clearEsgFlowSnapshot(): void {
  try {
    sessionStorage.removeItem(ESG_FLOW_SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}

/**
 * The paid read in flight in this tab, if any — its quote id and the library
 * ids of its uploads. Written as a paid read starts and cleared once its result
 * has landed (or it is known lost), so a dropped connection, a retry that meets
 * "already processed", or a reload can still collect what the quote bought.
 * Scoped by company: reading into one company's workbook never collects into
 * the create flow, nor the reverse.
 */
const ESG_PENDING_READ_KEY = "okiru-esg-pending-read-v1";
const esgPendingKeyFor = (companyId?: string | null) =>
  companyId ? `${ESG_PENDING_READ_KEY}:${companyId}` : ESG_PENDING_READ_KEY;

export function readEsgPendingRead(companyId?: string | null): PendingRead | null {
  return readPendingReadRecord(esgPendingKeyFor(companyId));
}

export function writeEsgPendingRead(record: PendingRead, companyId?: string | null): void {
  writePendingReadRecord(esgPendingKeyFor(companyId), record);
}

export function clearEsgPendingRead(companyId?: string | null): void {
  clearPendingReadRecord(esgPendingKeyFor(companyId));
}
