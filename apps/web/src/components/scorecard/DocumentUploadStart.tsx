/**
 * Document-upload start for /create-scorecard — the flagship entry.
 *
 * Each step does one job and has one main button:
 *  1. Add — a drop zone (Upload files), with the checklist and the company
 *     details folded away under it.
 *  2. Read — one read bar with the price (Read N documents); the price per
 *     document is behind "Cost details". While reading, one status line.
 *  3. Build — the figures the documents disagree on, the Build bar, one row
 *     of pillar chips and the side-by-side review (Build scorecard).
 * Everything not needed for the next decision sits behind a closed "details",
 * so nothing a user could do before has gone — it has moved.
 *
 * Data flow is unchanged: okiru-ai-parser (/api/parser/resolve-case-files) →
 * mapParserCaseToWorkbookSections → the SAME create → workbook import → submit
 * path manual entry and Excel import use (one canonical calculator).
 *
 * Status visuals follow the dataviz rules: state = icon + label, never color
 * alone; numbers/labels wear ink tokens, colored marks carry the state.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Minus } from "lucide-react";
import { UploadSurface } from "@/components/upload/flow/UploadSurface";
import { ReadBar, type ReadBarState } from "@/components/upload/flow/ReadBar";
import { CostDetails } from "@/components/upload/flow/CostDetails";
import { DocumentList, type DocumentListRow, type DocumentStatus } from "@/components/upload/flow/DocumentList";
import { StatusLine } from "@/components/upload/flow/StatusLine";
import { Disclosure } from "@/components/upload/flow/Disclosure";
import { sortPickedFiles, temporarySentence, unreadableSentence } from "@/components/upload/flow/readableFiles";
import { fileUnits, type TokenCost } from "@/components/upload/flow/tokenCost";
import { textButton } from "@/components/upload/flow/buttonStyles";
import {
  mapParserCaseToWorkbookSections,
  type ParserCaseLike,
  type ParserWorkbookMapResult,
} from "@/lib/parserWorkbookMap";
import { parserExtractionsToWorkbook, toWorkbookSections, mergeWorkbookSections } from "@/lib/parserToWorkbook";
import { vocabularyDecisionKey, type VocabularyDecisions } from "@/lib/workbookInjection";
import { getSection, parseWorkbookDate } from "@/components/workbook/sections";
import PillarDocumentBatches, { batchLabel, type UploadOrigin } from "./PillarDocumentBatches";
import ConfirmUploadDialog, { type PendingUpload } from "./ConfirmUploadDialog";
import { assessDocuments, isClassificationNote, isInternalJargon, type VerdictReport } from "@/lib/documentVerdicts";
import { reconcileEntity } from "@/lib/reconciliation/reconcileEntity";
import type { ReconcileResult } from "@/lib/reconciliation/types";
import { formFactMismatches, workbookFormFacts } from "@/lib/workbookInstructionFacts";
import {
  autofillProcurementFromCertificates,
  type AutofillReport,
  type ProcurementRow,
} from "@/lib/certificateAutofill";

/**
 * Are these the same rows the certificate lookup ran against?
 *
 * The lookup runs during the reveal, off the merged sections. If anything
 * changed since (a re-parse, a new file), its enriched rows are stale and must
 * not be created — the ids would no longer line up and a supplier could carry
 * another supplier's certificate. Cheap identity check, fails safe to re-running.
 */
function certificateFillCoversRows(
  filled: ProcurementRow[] | undefined,
  current: ProcurementRow[],
): boolean {
  if (!filled || filled.length !== current.length) return false;
  const ids = new Set(filled.map((r) => r._id));
  return current.every((r) => ids.has(r._id));
}

/** A value that is real text, not an HTML artifact or an empty placeholder. */
function cleanText(v: unknown): string {
  const s = String(v ?? "").trim();
  return /<\/?[a-z]/i.test(s) || s.length < 2 ? "" : s;
}

/** Field keys that name the measured entity, however a document labels it. */
const ENTITY_NAME_KEY = /^(measured_?entity(_name)?|entity_name|company_name|trading_name|legal_name|business_name|registered_name|name_of_(measured_)?entity)$/i;
/** In-text labels that precede a company name on letterheads, profiles, headers. */
const ENTITY_NAME_LABEL = /(?:measured\s*entity|company\s*name|registered\s*name|trading\s*(?:as|name)|name\s*of\s*(?:the\s*)?(?:measured\s*)?entity|entity\s*name)\s*[:\-]\s*(.+)/i;

/** Trim a captured name to something that looks like a company, not a sentence. */
function tidyEntityName(raw: string): string {
  let s = cleanText(String(raw).split(/\s{2,}|\||\t|;/)[0]); // stop at column / gap
  s = s.replace(/^(the\s+)?(measured\s+entity|company)\s*[:\-]?\s*/i, "").trim();
  // Keep it to a plausible name length; a whole paragraph is not a name.
  if (s.length > 90) s = s.slice(0, 90).trim();
  return s.length >= 2 ? s : "";
}

/**
 * The measured entity's name, from the richest source available — and then, as a
 * low-confidence fallback, from ANY document. The system should never leave the
 * name blank just because a registration certificate wasn't uploaded: a company
 * profile, a letterhead, or a workbook "Measured Entity:" header all name the
 * entity. We surface a best guess the user can correct rather than nothing.
 */
function pickEntityName(data: any): string {
  const ai = data?.ai_entities;
  // 1. The clean resolved field (highest confidence).
  const resolved = cleanText(ai?.fields?.entity_name?.value ?? ai?.fields?.company_name?.value);
  if (resolved) return resolved;
  // 2. Any ai.field whose KEY names the entity.
  for (const [k, f] of Object.entries(ai?.fields ?? {})) {
    if (ENTITY_NAME_KEY.test(k)) {
      const c = cleanText((f as { value?: unknown } | null)?.value);
      if (c) return c;
    }
  }
  // 3. Named fields inside the per-document extractions.
  for (const e of ai?.extractions ?? []) {
    for (const v of e?.values ?? []) {
      if (ENTITY_NAME_KEY.test(String(v?.field ?? ""))) {
        const c = cleanText(v?.value);
        if (c) return c;
      }
    }
  }
  // 4. Legacy calculator payload.
  const legacy = cleanText(data?.calculator_payload?.["ownership.entity_name"]);
  if (legacy) return legacy;
  // 5. LOW-CONFIDENCE FALLBACK: scan every string in the case for a labelled
  // company name ("Measured Entity: …", "Company Name: …", "Trading as …").
  const seen = new Set<unknown>();
  const stack: unknown[] = [data];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    for (const val of Object.values(node as Record<string, unknown>)) {
      if (typeof val === "string") {
        const m = val.match(ENTITY_NAME_LABEL);
        if (m) { const c = tidyEntityName(m[1]); if (c) return c; }
      } else if (val && typeof val === "object") {
        stack.push(val);
      }
    }
  }
  return "";
}

/** Every name/number the measured entity is known by — for the self-shareholder check. */
function collectEntityAliases(data: any): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => { const c = cleanText(v); if (c) out.add(c); };
  const ai = data?.ai_entities;
  add(ai?.fields?.entity_name?.value);
  add(ai?.fields?.company_name?.value);
  add(ai?.fields?.registration_number?.value);
  add(data?.calculator_payload?.["ownership.entity_name"]);
  add(data?.calculator_payload?.["company.registration_number"]);
  for (const e of ai?.extractions ?? []) {
    for (const v of e?.values ?? []) {
      if (/^(entity_name|company_name|registration_number|registration|company_registration)$/i.test(String(v?.field ?? ""))) add(v?.value);
    }
  }
  return Array.from(out);
}
import ReviewSection from "./ReviewSection";

interface RequiredGroup {
  key: string;
  label: string;
  types: string[];
  pillar?: string;
  required?: boolean;
  autoExtract?: boolean;
  note?: string;
}

interface SectorOption {
  code: string;
  label: string;
  subSectors?: Array<{ value: string; label: string }>;
  /**
   * The sector scores, but some part of its scorecard was applied by analogy
   * rather than transcribed from the gazette. Surfaced next to the Build
   * button, never left implicit.
   */
  provisional?: boolean;
  provisionalNote?: string;
}

interface ExpectedDocsCatalog {
  document_types: Array<{ name: string; description: string; required: boolean; pillar_code: string }>;
  required_groups: RequiredGroup[];
  sector_options?: SectorOption[];
}

/** The free, structure-only price scan (POST /api/parser/quote-files). */
interface ParserQuote {
  quoteId: string;
  currency: string;
  model: string;
  files: Array<{
    filename: string;
    detectedDocumentType: string;
    kind: string;
    requiresOcr: boolean;
    tokens: { basis: string; input: number; band: { lowerTokens: number; upperTokens: number } | null };
    structure: { pages: number | null; sheets: number | null; rows: number | null };
    pricing: { extractionCents: number; isUpperBound: boolean };
    reasons: string[];
  }>;
  lineItems: Array<{ key: string; label: string; detail: string; cents: number }>;
  totals: {
    predictedInputTokens: number;
    predictedOutputTokens: number;
    azureCents: number;
    totalCents: number;
    isUpperBound: boolean;
  };
  azureBreakdown: {
    model: string;
    inputTokens: number;
    inputCents: number;
    outputTokens: number;
    outputCents: number;
    ocrPages: number;
    ocrCents: number;
  };
  expiresAt: string;
  notes: string[];
  /**
   * Whether the server will actually charge for this run. When the payment
   * gate is off (no provider wired), we show the cost as information and let
   * the user carry on rather than offering a checkout that cannot settle.
   */
  paymentRequired?: boolean;
}

// What a batch costs in credit tokens (TokenCost) is shared with the ESG flow
// — one wallet, one shape: see components/upload/flow/tokenCost.
// The flow snapshot — how a paid extraction survives navigation. Shared with
// the Hub's "continue where you left off" strip, so it lives in its own module.
import {
  clearFlowSnapshot,
  clearPendingRead,
  readFlowSnapshot,
  readPendingRead,
  writeFlowSnapshot,
  writePendingRead,
} from "./flowSnapshot";
import { postParserRun, signedRunsByFile, withoutSignedRuns } from "@/lib/parserRunAttestation";
import {
  PaidReadInterrupted,
  RESUME_CHECKING_MESSAGE,
  RESUME_RUNNING_MESSAGE,
  collectPaidRead,
  isConnectionLoss,
  refundSentence,
  uncollectedReadMessage,
} from "@/lib/paidReadResume";

/** One upload a read covers: the File while this page holds it, its library id once saved. */
interface ReadUpload {
  name: string;
  file: File | null;
  documentId: string | null;
}

/** How a paid read ended: its result landed, it was refused or broke, or its connection dropped and it could not be collected. */
type ReadEnd = "delivered" | "failed" | "lost";
// Each "Add documents" round reads only its new files; this folds the result
// into what earlier rounds already read, without losing any of it.
import { mergeParserCases } from "@/lib/parserCaseMerge";
// The review that replaced the list under the Build button: each document,
// side by side with what we took from it and why anything was not read.
import { DocumentReview } from "@/components/review/DocumentReview";
import { applyReviewEdit, buildDocumentReview } from "@/lib/documentReview";

/** workbook company-information meta value for each parser sector code. */
const SECTOR_TO_WORKBOOK: Record<string, string> = {
  // The parser's generic option is coded "Generic", but every Toolkit sector
  // config (and okiruHubSectors) keys the generic Codes as "RCOGP". Mapping
  // "Generic" → "Generic" produced an industrySector no config matched, so the
  // workbook silently fell back and the chosen sector "didn't reflect". Both
  // "Generic" and "RCOGP" now resolve to the RCOGP config.
  Generic: "RCOGP",
  RCOGP: "RCOGP",
  CONSTRUCTION: "CONSTRUCTION",
  FSC: "FSC",
  TRANSPORT: "TRANSPORT",
  ICT: "ICT",
  AGRI: "AGRI",
};

const CANONICAL_PILLARS: Record<string, string> = {
  ESD: "Enterprise & Supplier Development",
  OWN: "Ownership",
  MAC: "Management Control",
  SKL: "Skills Development",
  SED: "Socio-Economic Development",
};

/** Pillar rack tiles — coverage pillar name → short label. */
const PILLAR_TILES: Array<{ pillar: string; short: string }> = [
  { pillar: "Ownership", short: "Ownership" },
  { pillar: "Management Control", short: "Management" },
  { pillar: "Skills Development", short: "Skills" },
  { pillar: "Preferential Procurement", short: "Procurement" },
  { pillar: "Socio-Economic Development", short: "SED" },
  { pillar: "Financials", short: "Financials" },
];

export interface DocumentUploadStartProps {
  /**
   * Create the client + import the mapped sections + land on the provisional
   * score page. `verdicts` rides along so that page can show the honest
   * per-document ledger (found / confused / none) the requote is argued from.
   */
  onCreate: (
    companyName: string,
    sections: Record<string, { rows?: unknown[]; meta?: Record<string, unknown> }>,
    extras?: {
      verdicts?: VerdictReport;
      reconcile?: ReconcileResult;
      /**
       * Library ids of every document this run persisted. The host files them
       * under the created company, so the document library is organised per
       * company instead of one flat, unowned list.
       */
      documentIds?: string[];
    },
  ) => Promise<void>;
  creating: boolean;
  /**
   * Open on the dropzone alone.
   *
   * Set when the user reached this having already chosen "upload documents" in
   * the workspace. They asked for a screen that is just about uploading, and
   * landing on one covered in a company-profile panel and fifteen pillar
   * batches reads as being asked to do something else first. Everything else
   * appears the moment a file is staged — the sector and size are needed for
   * the quote, and the batches are how a long pack gets organised.
   */
  focused?: boolean;
  /**
   * Adding documents to a company that already exists, rather than creating
   * one. Its profile is known, so it is filled in; Build becomes "Add to the
   * workbook", and the host MERGES the result (`onCreate` receives the
   * sections as usual). The paid read is kept under its own session key.
   */
  existingCompany?: {
    id: string;
    name: string;
    /** Workbook sector code (RCOGP, TRANSPORT, …). */
    sectorCode: string;
    scorecardType: string;
    /** yyyy-mm-dd or dd/mm/yyyy. */
    financialYearEnd: string;
  };
}

/** The workbook's dd/mm/yyyy (or ISO) year end, as the date input's yyyy-mm-dd. */
function isoDate(value: string): string {
  const d = parseWorkbookDate(value);
  return d ? d.toISOString().slice(0, 10) : "";
}

export function DocumentUploadStart({ onCreate, creating, focused = false, existingCompany }: DocumentUploadStartProps) {
  const addMode = Boolean(existingCompany);
  /** Where this run's paid read is kept for the session — never shared with the create flow. */
  const snapshotScope = existingCompany ? `add:${existingCompany.id}` : undefined;
  const [catalog, setCatalog] = useState<ExpectedDocsCatalog | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [libraryWarning, setLibraryWarning] = useState<string | null>(null);
  /** What the server returned for a paid run that delivered less than it cost. */
  const [refundNotice, setRefundNotice] = useState<string | null>(null);
  /** Set while a dropped read is being collected and the server says it is still reading. */
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  /** A dropped read that could not be collected: what happened, whether the tokens come back, and a way on. */
  const [readLost, setReadLost] = useState<{ message: string; quoteId: string; canCheckAgain: boolean } | null>(null);
  /** Polling for a dropped read stops when the page goes. */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [parserCase, setParserCase] = useState<ParserCaseLike | null>(null);
  /** The case as of now, for the merge at the end of a read (which outlives the render it started in). */
  const parserCaseRef = useRef<ParserCaseLike | null>(null);
  useEffect(() => {
    parserCaseRef.current = parserCase;
  }, [parserCase]);
  /**
   * The files already read and paid for, by persistence key.
   *
   * This is what makes "Add documents" work after a read. Every gate used to
   * key off `parserCase` — "has anything been read yet" — so once one batch
   * was read, a forgotten document could be staged but never priced or read.
   * Now only UNREAD files are priced and read, their result is merged into
   * the case, and a read file is part of that case: it can't be removed, and
   * it is never charged for again.
   */
  const [readKeys, setReadKeys] = useState<Set<string>>(() => new Set());
  const readKeysRef = useRef(readKeys);
  useEffect(() => {
    readKeysRef.current = readKeys;
  }, [readKeys]);
  const persistedDocumentsRef = useRef<Map<string, string>>(new Map());
  /**
   * The phase banner that reports the paid read.
   *
   * It renders below a staged list that is often long enough to push it off the
   * screen, so starting extraction changed nothing the user could see and the
   * work looked like it had not begun. We carry them to it instead.
   */
  const extractionPhaseRef = useRef<HTMLDivElement | null>(null);
  // Per-file extraction progress, keyed by the file's name (the streaming parser
  // reports fileName, and the create-scorecard list is de-duped by name).
  const [docProgress, setDocProgress] = useState<Record<string, 'parsing' | 'done' | 'error'>>({});
  // True once every file is parsed and the parser is doing the cross-document
  // resolve + AI step (which is one phase, not per-file).
  const [resolving, setResolving] = useState(false);
  // Sub-progress through the rate-limited AI resolve phase ({done,total}).
  const [resolveProgress, setResolveProgress] = useState<{ done: number; total: number } | null>(null);
  // The "what we read / still needed / didn't reconcile" detail is long; keep it
  // collapsed so it never pushes the Build button off-screen. The pillar rack
  // above it is the at-a-glance summary.
  const [companyName, setCompanyName] = useState(existingCompany?.name ?? "");
  const [dragActive, setDragActive] = useState(false);
  // Deliberately UNSET: the sector/size choice decides which scorecard rules
  // apply, and a silent Generic default once scored a real Transport QSE
  // dozens of points too low. Create stays disabled until both are chosen.
  const [sector, setSector] = useState(existingCompany?.sectorCode ?? "");
  const [subSector, setSubSector] = useState("");
  const [size, setSize] = useState(existingCompany?.scorecardType ?? ""); // Generic | QSE | EME
  // Financial year-end, yyyy-mm-dd. REQUIRED, and asked for here because the
  // documents never supply it: the B-BBEE parser does not read one. Without it
  // the workbook's submit refuses to calculate (every dated pillar is measured
  // over the twelve months ending on it), and a refused submit used to land on
  // a provisional score of 0 — that is how a fully-uploaded evidence pack
  // scored nothing. Also unset by default: a guessed year end is a wrong period.
  const [yearEnd, setYearEnd] = useState(existingCompany ? isoDate(existingCompany.financialYearEnd) : "");
  // Quote + payment (flow steps 3–6). Nothing is read until the quote is paid.
  const [quote, setQuote] = useState<ParserQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  /**
   * Has the user said they are FINISHED adding documents?
   *
   * The quote is free and re-issued on every change, but the checkout panel it
   * fed used to appear the instant the first file landed — above the uploader,
   * pushing it down the page. Staging one pillar therefore looked like being
   * marched to payment with nowhere to carry on, and the natural response was
   * to pay before the other pillars had been filled. Nothing is read until
   * payment, so an early checkout does not cost money; it costs the user the
   * rest of their evidence.
   *
   * Reset to false whenever the file list changes, because a batch you have
   * added to is a batch you are still working on.
   */
  const [doneStaging, setDoneStaging] = useState(false);
  const [paying, setPaying] = useState(false);
  /** The batch's cost in credit tokens, priced by the server from the quote. */
  const [tokenCost, setTokenCost] = useState<TokenCost | null>(null);
  /**
   * Which batch each staged file was filed under. Presentation only — the
   * classifier still decides what a document actually is and which pillar it
   * scores against. This just shows the user where their own work went.
   */
  const [filedBatchByFile, setFiledBatchByFile] = useState<Record<string, string>>({});
  /** Files chosen but not yet confirmed. The double-check dialog owns these. */
  const [pendingUpload, setPendingUpload] = useState<(PendingUpload & { origin: UploadOrigin }) | null>(null);
  /**
   * Closed-vocabulary decisions from the server (model-backed, remembered).
   * A dropdown value the local maps cannot place is asked about ONCE, and the
   * answer is applied on the next mapping pass, exactly like a synonym.
   */
  const [vocabulary, setVocabulary] = useState<VocabularyDecisions>({});
  /** Wordings already asked about in this mount, so a "none" is not re-asked every render. */
  const vocabularyAskedRef = useRef<Set<string>>(new Set());
  /**
   * Set when this mount rehydrated a previous run's paid extraction. The
   * reveal renders from the restored case even though no File objects survive
   * navigation, and a banner says where the data came from.
   */
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  /** Library ids carried by a restored snapshot — the File objects are gone
      but the uploads still exist and must still be filed under the company. */
  const restoredDocumentIdsRef = useRef<string[]>([]);
  /** Library id per file name from a restored snapshot — the preview's source once the uploads are gone. */
  const restoredIdsByNameRef = useRef<Record<string, string>>({});

  /** Library id per file name: this mount's uploads, then whatever a restore carried. */
  const documentIdsByName = (): Record<string, string> => {
    const out: Record<string, string> = { ...restoredIdsByNameRef.current };
    for (const f of files) {
      const id = persistedDocumentsRef.current.get(`${f.name}:${f.size}:${f.lastModified}`);
      if (id) out[f.name] = id;
    }
    return out;
  };

  /** Every library id this run owns: restored ones plus this mount's uploads. */
  const allDocumentIds = () =>
    Array.from(
      new Set(restoredDocumentIdsRef.current.concat(Array.from(persistedDocumentsRef.current.values()))),
    );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  /** Files a folder upload could not read — shown as a warning, not an error. */
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);
  /** Office lock files set aside from the last pick — a notice, not an error. */
  const [temporaryNotice, setTemporaryNotice] = useState<string | null>(null);
  /**
   * Procurement rows enriched from the certificate registry, plus the account of
   * what was matched. Computed during the reveal so the user SEES the registry's
   * contribution before creating, rather than having it happen invisibly on
   * click. `handleCreate` reuses exactly these rows.
   */
  const [certificateFill, setCertificateFill] = useState<{
    rows: ProcurementRow[];
    report: AutofillReport;
  } | null>(null);
  const [certificateFillRunning, setCertificateFillRunning] = useState(false);
  /** Monotonic id so a superseded lookup never writes over a newer one. */
  const certificateFillSeq = useRef(0);
  /** Monotonic id so only the latest quote request writes state (race guard). */
  const quoteSeqRef = useRef(0);
  /** Aborts any in-flight quote when a newer one starts, so requests never pile up. */
  const quoteAbortRef = useRef<AbortController | null>(null);
  /**
   * Bumped outside runQuote (file-cap error, file removal) to invalidate an
   * in-flight quote whose result must no longer be applied.
   */
  const quoteRequestRef = useRef(0);
  const MAX_UPLOAD_FILES = 100; // a full verification evidence pack is ~70 files

  // Rehydrate a previous run's paid extraction. Runs once, on mount, before
  // any interaction — so it can never clobber work done in this mount.
  useEffect(() => {
    const snap = readFlowSnapshot(snapshotScope);
    if (!snap) return;
    setParserCase(snap.parserCase);
    setCompanyName((prev) => prev.trim() || snap.companyName);
    if (snap.sector) setSector(snap.sector);
    if (snap.subSector) setSubSector(snap.subSector);
    if (snap.size) setSize(snap.size);
    if (snap.yearEnd) setYearEnd(snap.yearEnd);
    setFiledBatchByFile(snap.filedBatchByFile ?? {});
    restoredDocumentIdsRef.current = snap.documentIds ?? [];
    restoredIdsByNameRef.current = snap.documentIdsByName ?? {};
    setRestoredAt(snap.savedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the snapshot's profile fields (name, sector, size) current while a
  // restored/extracted case is on screen, so leaving again loses nothing.
  // Debounced: the case JSON can be large and the name is typed key by key.
  useEffect(() => {
    if (!parserCase) return;
    const timer = window.setTimeout(() => {
      const snap = readFlowSnapshot(snapshotScope);
      if (!snap) return;
      // The case too: a value corrected in the review must survive leaving
      // the page as surely as the read it corrects.
      writeFlowSnapshot({ ...snap, parserCase, companyName, sector, subSector, size, yearEnd }, snapshotScope);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [parserCase, companyName, sector, subSector, size, yearEnd]);

  // Re-fetch the expected-documents checklist whenever the sector context
  // changes — the required documents differ by sector code and entity size.
  useEffect(() => {
    void (async () => {
      try {
        // Fallback keeps the checklist useful before the user has chosen; the
        // CREATE stamp never uses this fallback (create requires the choice).
        const params = new URLSearchParams({ sector: sector || "Generic", size: size || "Generic" });
        if (subSector) params.set("subSector", subSector);
        const res = await fetch(`/api/parser/document-types?${params.toString()}`, { credentials: "include" });
        if (res.ok) setCatalog(await res.json());
      } catch {
        // checklist is progressive enhancement — uploads still work without it
      }
    })();
  }, [sector, subSector, size]);

  // Show and pass "RCOGP" for the generic Codes so the chosen sector connects to
  // the RCOGP Toolkit config (the parser codes it "Generic", which matches no
  // config). Label made explicit for the user.
  const sectorOptions = (catalog?.sector_options ?? []).map((s) =>
    s.code === "Generic" ? { ...s, code: "RCOGP", label: "RCOGP — Generic Codes (all industries)" } : s,
  );
  const activeSector = sectorOptions.find((s) => s.code === sector);

  // The sector and year end the workbook's Instructions sheet states. They fill
  // the form only where it is EMPTY — once per stated value, so a field the user
  // cleared stays cleared — and never replace what the user chose; where the
  // user's value differs, the note under the Build bar says so.
  const workbookFacts = useMemo(() => workbookFormFacts(parserCase), [parserCase]);
  const prefilledFactsRef = useRef("");
  useEffect(() => {
    const key = `${workbookFacts.sector ?? ""}|${workbookFacts.yearEnd ?? ""}`;
    if (key === "|" || key === prefilledFactsRef.current) return;
    prefilledFactsRef.current = key;
    if (workbookFacts.sector) setSector((prev) => prev || workbookFacts.sector!);
    if (workbookFacts.yearEnd) setYearEnd((prev) => prev || workbookFacts.yearEnd!);
  }, [workbookFacts]);
  const workbookMismatches = formFactMismatches({ sector, yearEnd }, workbookFacts);

  const mapped: ParserWorkbookMapResult | null = useMemo(
    () => (parserCase ? mapParserCaseToWorkbookSections(parserCase) : null),
    [parserCase],
  );

  /**
   * The AI-entity path: full extractions (share registers become many rows,
   * TMPS lands in meta, dropdowns are matched, required gaps hunted). Runs
   * alongside the legacy `mapped` result — the parser returns both shapes during
   * the transition, and this one is preferred where it has data because it
   * carries provenance, rejections and coverage the legacy shape does not.
   */
  const injected = useMemo(() => {
    const extractions = (parserCase as {
      ai_entities?: { extractions?: Array<{ documentId?: string; sourceFile?: string; element?: string; values?: Array<{ field: string; value: unknown }>; exceptions?: unknown[] }> };
    } | null)?.ai_entities?.extractions;
    if (!extractions?.length) return null;

    return parserExtractionsToWorkbook(
      extractions.map((e) => ({
        documentId: String(e.documentId ?? ""),
        sourceFile: String(e.sourceFile ?? ""),
        element: e.element,
        values: e.values ?? [],
        // The reader's findings travel too: a TMPS cell holding #REF! is
        // filed in the workbook as withdrawn, so the sync leaves it blank.
        exceptions: (e.exceptions ?? []).map((note) => String(note ?? "")),
      })),
      { sectorCode: sector || "Generic", scorecardType: size || "Generic", vocabulary },
    );
  }, [parserCase, sector, size, vocabulary]);

  /**
   * THE GENERAL MECHANISM behind every dropdown. Values the deterministic maps
   * rejected as "not one of" are sent, in one batch, to the vocabulary
   * resolver: the model places them by meaning onto the column's own options
   * (or says none), the server remembers the answer for every customer, and
   * the mapping memo re-runs with the decisions. A value it cannot place stays
   * in review, as before. Nothing here guesses; it only stops the lists from
   * being the ceiling.
   */
  useEffect(() => {
    if (!injected) return;
    const items: Array<{ column: string; value: string; options: string[] }> = [];
    const seen = new Set<string>();
    for (const r of injected.rejected) {
      if (r.reason !== "no_matching_option" || !r.section) continue;
      const value = String(r.value ?? "").trim();
      if (!value) continue;
      const key = vocabularyDecisionKey(r.field, value);
      if (seen.has(key) || vocabularyAskedRef.current.has(key) || vocabulary[key]) continue;
      const section = getSection(r.section, SECTOR_TO_WORKBOOK[sector] ?? "Generic", size || "Generic");
      const column = section?.columns?.find((c) => c.key === r.field) ?? section?.meta?.find((c) => c.key === r.field);
      const options = column?.options ?? [];
      if (options.length === 0) continue;
      seen.add(key);
      items.push({ column: r.field, value, options });
    }
    if (items.length === 0) return;
    for (const it of items) vocabularyAskedRef.current.add(vocabularyDecisionKey(it.column, it.value));
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/vocabulary/resolve", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { decisions?: Array<{ column: string; value: string; option: string | null }> };
        const next: VocabularyDecisions = {};
        for (const d of body.decisions ?? []) {
          if (d.option) next[vocabularyDecisionKey(d.column, d.value)] = d.option;
        }
        if (!cancelled && Object.keys(next).length > 0) setVocabulary((prev) => ({ ...prev, ...next }));
      } catch {
        // No resolver reachable: the rejections stand, honestly.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injected]);

  /**
   * The procurement rows as they will actually be created — the same merge
   * `handleCreate` performs, hoisted so the certificate lookup and the create
   * both run against one set of rows.
   */
  const mergedProcurementRows = useMemo(() => {
    if (!mapped && !injected) return [] as ProcurementRow[];
    const sections = mergeWorkbookSections(
      mapped?.sections ?? {},
      injected ? toWorkbookSections(injected) : {},
    );
    return (sections.procurement?.rows ?? []) as ProcurementRow[];
  }, [mapped, injected]);

  /**
   * AUTO-DETECT AGAINST THE CERTIFICATE REGISTRY.
   *
   * The upload almost always names more suppliers than it evidences: the
   * schedule lists forty, three certificates come with it. For the other
   * thirty-seven we may already hold the certificate — 2,951 of them sit in the
   * registry — so every extracted supplier is looked up and its blank scoring
   * columns filled from what we already have.
   *
   * Runs here rather than on the Create click for two reasons: the user sees
   * what the registry contributed while they can still question it, and the
   * pillar rack and stat tiles below reflect the real, enriched state of
   * Procurement instead of understating it.
   */
  useEffect(() => {
    if (mergedProcurementRows.length === 0) {
      certificateFillSeq.current += 1; // invalidate anything still in flight
      setCertificateFill(null);
      setCertificateFillRunning(false);
      return;
    }
    const seq = ++certificateFillSeq.current;
    setCertificateFillRunning(true);
    void (async () => {
      const result = await autofillProcurementFromCertificates(mergedProcurementRows);
      if (seq !== certificateFillSeq.current) return; // superseded
      setCertificateFill(result);
      setCertificateFillRunning(false);
    })();
  }, [mergedProcurementRows]);

  /**
   * Placement telemetry — the honest not-placed list is the improvement
   * backlog. Fired once per extracted case (identity-deduped), after the
   * mapping memos settle, so what the user sees in the rejection panel is
   * exactly what lands in the backlog. Fire-and-forget: telemetry never
   * blocks or fails the flow.
   */
  const telemetrySentForCaseRef = useRef<unknown>(null);
  useEffect(() => {
    if (!parserCase || !injected) return;
    if (telemetrySentForCaseRef.current === parserCase) return;
    telemetrySentForCaseRef.current = parserCase;
    try {
      const byKey = new Map<string, { field: string; context: string | null; reason: string; count: number }>();
      for (const r of injected.rejected) {
        const key = `${r.field}::${r.detail}`;
        const row = byKey.get(key) ?? { field: r.field, context: null, reason: r.detail, count: 0 };
        row.count += 1;
        byKey.set(key, row);
      }
      const placedRows = Object.values(injected.rows).reduce(
        (n, sectionRows) => n + (sectionRows?.length ?? 0),
        0,
      );
      void Promise.resolve(
        fetch("/api/telemetry/placement", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain: "bbbee",
            caseId: (parserCase as { case_id?: string }).case_id ?? null,
            fileCount: (parserCase.documents_detected ?? []).length,
            placedCount: placedRows,
            unplacedCount: injected.rejected.length,
            unplaced: Array.from(byKey.values()),
            unmapped: injected.coverage?.unmapped ?? [],
          }),
        }),
      ).catch(() => {});
    } catch {
      // telemetry must never cost a user their extraction
    }
  }, [parserCase, injected]);

  /**
   * Reconciliation findings from the deterministic table read — a sheet whose
   * labelled TOTAL the extracted rows do not sum to. Advisory and specific:
   * only the sheet-table extractions raise these (the matrix specs' free-form
   * exceptions would flood this panel), and they are shown so a surprising
   * score traces back to the evidence instead of reading as a mystery.
   */
  const reconciliationFlags = useMemo(() => {
    const extractions = (parserCase as {
      ai_entities?: { extractions?: Array<{ documentId?: string; sourceFile?: string; exceptions?: unknown[] }> };
    } | null)?.ai_entities?.extractions ?? [];
    const flags: Array<{ sourceFile: string; note: string }> = [];
    for (const e of extractions) {
      const documentId = String(e.documentId ?? "");
      // The Finance-sheet reader raises one specific finding: a labelled total
      // (TMPS) whose cell holds a spreadsheet error such as #REF!. Only that is
      // shown from it; analyst notes may also land on its extraction.
      const financials = documentId === "sheet_financials";
      if (!documentId.startsWith("sheet_table__") && !financials) continue;
      for (const note of e.exceptions ?? []) {
        const text = String(note ?? "").trim();
        if (!text || (financials && !/\bcell holds #/.test(text))) continue;
        flags.push({ sourceFile: String(e.sourceFile ?? ""), note: text });
      }
    }
    // Cross-document disagreements found while linking — most usefully a
    // supplier's own ledger against the client's schedule.
    for (const finding of injected?.reconciliation ?? []) {
      flags.push({ sourceFile: finding.entity, note: finding.message });
    }
    return flags;
  }, [parserCase, injected]);

  /**
   * Matrix document ids the parser actually read something out of, so the
   * checklist can show real coverage instead of a static wish list. Only
   * extractions that produced values count — a document we recognised but got
   * nothing from is not evidence.
   */
  const satisfiedDocumentIds = useMemo<string[]>(() => {
    const extractions = (parserCase as { ai_entities?: { extractions?: Array<{ documentId?: string; values?: unknown[] }> } } | null)
      ?.ai_entities?.extractions ?? [];
    return extractions
      .filter((extraction) => (extraction.values?.length ?? 0) > 0)
      .map((extraction) => String(extraction.documentId ?? ""))
      .filter(Boolean);
  }, [parserCase]);

  /** The quote's row for a file — what we know from the free structure scan. */
  const quoted = (filename: string) => quote?.files.find((f) => f.filename === filename);

  const docTypeSatisfied = (typeName: string): boolean =>
    Boolean(
      (parserCase?.documents_detected ?? []).some(
        (d) => d.document_type === typeName && d.status !== "failed",
      ),
    );

  const humanizeField = (f: string): string =>
    f.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

  /**
   * Content the parser could NOT read inside a specific uploaded document, split
   * into `fields` (named data points it expected but couldn't extract) and
   * `notes` (validation messages, e.g. low confidence). Surfaced during the flow
   * so the user knows exactly what to complete rather than finding gaps later.
   */
  const docMissingContent = (filename: string): { fields: string[]; notes: string[] } => {
    const detected = (parserCase?.documents_detected ?? []).find((d) => d.filename === filename);
    const review = (parserCase?.documents_needing_review ?? []).find((r) => r.filename === filename);
    const fields = new Set<string>();
    const notes = new Set<string>();
    for (const f of detected?.validation?.missing_fields ?? []) {
      if (isInternalJargon(f)) continue; // never surface internal section names
      fields.add(humanizeField(f));
    }
    const rawNotes = [
      ...(detected?.validation?.errors ?? []),
      ...(detected?.validation?.warnings ?? []),
      ...(review?.reasons ?? []),
    ];
    for (const n of rawNotes) {
      const trimmed = (n ?? "").trim();
      if (!trimmed) continue;
      // A low classification-confidence note is NOT a read gap (the values were
      // read fine; the parser was only unsure what to call the document), and
      // internal plumbing names ("reconcile not found") mean nothing to a user.
      if (isClassificationNote(trimmed) || isInternalJargon(trimmed)) continue;
      const m = /^(.*)\smissing$/i.exec(trimmed);
      if (m) { if (!isInternalJargon(m[1])) fields.add(humanizeField(m[1])); }
      else notes.add(trimmed);
    }
    return { fields: Array.from(fields), notes: Array.from(notes) };
  };

  /**
   * Step 3–5: scan the documents for a PRICE only. This reads structure and
   * text layers locally — it never OCRs, never calls Azure, and never extracts
   * entities. It is free, and it is all we are allowed to do before payment.
   */
  const runQuote = async (list: File[]) => {
    if (list.length === 0) return;
    // Only the most recent quote request is allowed to write state. Without
    // this, two overlapping requests can race and leave `quoting` stuck true
    // (the earlier one resolves last), which hides the payment panel forever.
    // `quoteRequestRef` is also bumped externally (file cap, file removal), so
    // staleness means EITHER counter has moved on.
    const seq = ++quoteSeqRef.current;
    const requestId = ++quoteRequestRef.current;
    const isLatest = () =>
      quoteSeqRef.current === seq && quoteRequestRef.current === requestId;
    // Cancel any quote still in flight so two rapid uploads can't both run — a
    // stranded second request would leave `quoting` stuck true and hide the
    // payment panel forever.
    quoteAbortRef.current?.abort();
    const controller = new AbortController();
    quoteAbortRef.current = controller;
    setQuoting(true);
    setParseError(null);
    try {
      const form = new FormData();
      for (const f of list) form.append("files", f, f.name);
      const res = await fetch("/api/parser/quote-files", {
        method: "POST",
        credentials: "include",
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Could not price these documents (${res.status})`);
      const body = await res.json();
      if (isLatest()) setQuote((body.data ?? body) as ParserQuote);
    } catch (err) {
      // An aborted request is a superseded one, not a failure — stay quiet.
      if ((err as Error)?.name === "AbortError") return;
      if (isLatest()) {
        setParseError(err instanceof Error ? err.message : "Could not price the documents");
        setQuote(null);
      }
    } finally {
      if (isLatest()) setQuoting(false);
    }
  };

  /**
   * Price the quote in credit tokens as soon as we have one.
   *
   * Deliberately a separate call from the quote itself: the parser knows what
   * reading these files costs, the web app knows what the organisation holds,
   * and only the second one is allowed to answer "can you afford this". Failing
   * to price is non-fatal — the batch panel falls back to showing the work
   * without a token figure rather than blocking the flow.
   */
  useEffect(() => {
    if (!quote?.quoteId) {
      setTokenCost(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/tokens/quote/${encodeURIComponent(quote.quoteId)}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as TokenCost;
        if (!cancelled) setTokenCost(body);
      } catch {
        if (!cancelled) setTokenCost(null);
      }
    })();
    return () => { cancelled = true; };
  }, [quote?.quoteId]);

  /**
   * Take the user to the phase banner the moment the paid read starts.
   *
   * Pressing process swaps a panel that sits below the staged documents, so on
   * any real evidence pack the only visible change was a button going quiet —
   * indistinguishable from a click that did nothing. Runs on the rising edge
   * only, so the banner's own updates never yank the page around while reading.
   */
  useEffect(() => {
    if (!parsing) return;
    const frame = requestAnimationFrame(() => {
      extractionPhaseRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [parsing]);

  const filePersistenceKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
  /** Not yet read — the only files a quote, a charge or a read may include. */
  const isUnread = (file: File) => !readKeysRef.current.has(filePersistenceKey(file));
  const unreadFiles = files.filter((f) => !readKeys.has(filePersistenceKey(f)));

  /** Persist the original file before any paid parser work begins. */
  const persistDocument = async (file: File): Promise<string> => {
    const key = filePersistenceKey(file);
    const existing = persistedDocumentsRef.current.get(key);
    if (existing) return existing;

    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch("/api/parser-documents/upload", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.document?.id) {
      throw new Error(body?.message ?? `Could not save ${file.name} to your document library`);
    }
    const id = String(body.document.id);
    persistedDocumentsRef.current.set(key, id);
    return id;
  };

  const persistSelectedDocuments = async (list: File[]): Promise<void> => {
    await Promise.all(list.map((file) => persistDocument(file)));
  };

  /** The library id of an upload: saved already (a collected read after a reload), or saved now. */
  const documentIdOf = async (upload: ReadUpload): Promise<string> => {
    if (upload.file) return persistDocument(upload.file);
    if (upload.documentId) return upload.documentId;
    throw new Error(`${upload.name} is not in your document library`);
  };

  /** The uploads a read of `list` covers, with whatever library ids they already have. */
  const uploadsOf = (list: File[], idsByName: Record<string, string> = {}): ReadUpload[] =>
    list.map((file) => ({
      name: file.name,
      file,
      documentId: persistedDocumentsRef.current.get(filePersistenceKey(file)) ?? idsByName[file.name] ?? null,
    }));

  const prepareAndQuote = async (list: File[]): Promise<void> => {
    setLibraryWarning(null);
    // The WHOLE pipeline is "checking" — saving to the library and then
    // pricing. `quoting` used to flip on only when pricing began, so during
    // the save the Done button sat enabled next to whatever quote the
    // PREVIOUS batch had left behind, and clicking it opened a checkout
    // priced for a different set of files. Claim the checking state and drop
    // the stale quote before anything async happens.
    const requestId = ++quoteRequestRef.current;
    // Price only what has not been read. A document read in an earlier round
    // is paid for and already in the case; quoting it again is how adding one
    // forgotten file would have re-charged the whole pack.
    const toPrice = list.filter(isUnread);
    setQuote(null);
    if (toPrice.length === 0) {
      setQuoting(false);
      return;
    }
    setQuoting(true);
    try {
      await persistSelectedDocuments(toPrice);
      // A newer batch started while these files were saving — its pipeline
      // owns the quote now, and pricing this older list would race it.
      if (quoteRequestRef.current !== requestId) return;
      await runQuote(toPrice);
    } catch (error) {
      if (quoteRequestRef.current !== requestId) return; // superseded
      setQuote(null);
      setQuoting(false);
      setParseError(error instanceof Error ? error.message : "Could not save these documents");
    }
  };

  /**
   * Save one immutable, lossless run for every uploaded file the case parser
   * read — as the record the parser signed, which carries both layers of the
   * read: the rule layer and every value the AI model and the agent read, with
   * its citation. A workbook read sheet by sheet is one run, the workbook's.
   * A file the parser did not sign for is reported, not skipped.
   */
  const persistParserRuns = async (data: ParserCaseLike, uploads: ReadUpload[]): Promise<void> => {
    const caseData = data as ParserCaseLike & { case_id?: string };
    const reviewRows = data.documents_needing_review ?? [];
    const signed = signedRunsByFile(data);
    const uploadNames = new Set(uploads.map((upload) => upload.name));
    // The upload a detected document came from: itself, or the workbook a
    // sheet ("Pack.xlsx › Ownership") was split out of.
    const uploadOf = (name: string) => {
      if (uploadNames.has(name)) return name;
      const marker = name.indexOf("›");
      const workbook = marker >= 0 ? name.slice(0, marker).trim() : "";
      return uploadNames.has(workbook) ? workbook : null;
    };
    /** The run as the library took it before runs were signed (see LegacyRunBody). */
    const legacyParserOutput = (detected: any, documentId: string): Record<string, unknown> => detected.parser_output ?? {
      ...detected,
      file_id: detected.file_id ?? documentId,
      filename: detected.filename,
      document_type: detected.document_type ?? "Unknown",
      pillar: detected.pillar ?? "",
      extracted_fields: detected.extracted_fields ?? {},
      calculator_payload: detected.calculator_payload ?? {},
      supplier_rows: (data.supplier_rows ?? []).filter((row) => row.source_file === detected.filename),
      measured_procurement_spend: (caseData as any).measured_procurement_spend ?? null,
      validation: {
        passed: detected.status === "passed",
        warnings: detected.validation?.warnings ?? [],
        errors: detected.validation?.errors ?? [],
        missing_fields: detected.validation?.missing_fields ?? [],
      },
      audit_trail: {
        source_file: detected.filename,
        matched_patterns: [],
        rules_applied: [],
        graph_version: "unknown",
        requires_human_review: detected.status !== "passed",
        classification_candidates: [],
        rejected_calculator_keys: [],
      },
    };

    const filesInCase = new Set<string>(Array.from(signed?.keys() ?? []).filter((name) => uploadNames.has(name)));
    const unmatched: string[] = [];
    for (const detected of data.documents_detected ?? []) {
      const upload = uploadOf(String(detected.filename ?? ""));
      if (upload) filesInCase.add(upload);
      else unmatched.push(String(detected.filename));
    }
    const tasks = Array.from(filesInCase).map(async (filename) => {
      const documentId = await documentIdOf(uploads.find((candidate) => candidate.name === filename)!);
      const detected = (data.documents_detected ?? []).find((doc) => doc.filename === filename);
      // A workbook read sheet by sheet never had a pre-signing body.
      const legacy = detected
        ? {
            parserOutput: legacyParserOutput(detected, documentId),
            caseId: caseData.case_id ?? null,
            reviewReasons: reviewRows.find((row) => row.filename === filename)?.reasons ?? [],
          }
        : null;
      await postParserRun(documentId, filename, { signed: signed?.get(filename), legacy });
    });
    const results = await Promise.allSettled(tasks);
    const failures = results.filter((result) => result.status === "rejected").length + unmatched.length;
    if (failures > 0) {
      throw new Error(`${failures} parser result${failures === 1 ? "" : "s"} could not be saved to the document library.`);
    }
  };

  /**
   * Finish a read exactly as a completed stream does: file the signed runs in
   * the library, merge into the case, mark the files read and keep the
   * snapshot. One path for a stream that delivered and for a read collected
   * after its connection dropped, so the two can never end differently.
   */
  const completeRead = async (
    data: ParserCaseLike & { calculator_payload?: Record<string, unknown> },
    uploads: ReadUpload[],
  ): Promise<void> => {
    try {
      await persistParserRuns(data, uploads);
      setLibraryWarning(null);
    } catch (persistenceError) {
      console.error("[DocumentUploadStart] Parser result persistence failed", persistenceError);
      setLibraryWarning(persistenceError instanceof Error ? persistenceError.message : "Parser results were not saved to the document library.");
    }
    // Uploads that are only in the library (a read collected after a reload)
    // still belong to this run: create files them under the company.
    for (const upload of uploads) {
      if (upload.file || !upload.documentId) continue;
      if (!restoredDocumentIdsRef.current.includes(upload.documentId)) {
        restoredDocumentIdsRef.current = [...restoredDocumentIdsRef.current, upload.documentId];
      }
      restoredIdsByNameRef.current = { ...restoredIdsByNameRef.current, [upload.name]: upload.documentId };
    }
    // Merge with anything already paid for and read in an earlier round, so a
    // requote never loses (or re-charges for) documents we already have.
    // The signed records were filed above; the case keeps no second copy.
    const mergedCase = mergeParserCases(parserCaseRef.current, withoutSignedRuns(data));
    parserCaseRef.current = mergedCase;
    setParserCase(mergedCase);
    // These files are now part of the case: never priced, charged or read again.
    const nowRead = new Set(readKeysRef.current);
    for (const upload of uploads) if (upload.file) nowRead.add(filePersistenceKey(upload.file));
    readKeysRef.current = nowRead;
    setReadKeys(nowRead);
    setQuote(null);
    setTokenCost(null);
    setDoneStaging(false);
    // No File objects survive a reload; a read collected after one reveals
    // from the case alone, the way a restored snapshot does.
    if (uploads.length > 0 && uploads.every((upload) => !upload.file)) setRestoredAt(new Date().toISOString());
    const readNames = Array.from(
      new Set([...(readFlowSnapshot(snapshotScope)?.fileNames ?? []), ...uploads.map((upload) => upload.name)]),
    );
    // Auto-fill the company name from the extracted entity name — the
    // resolved ai_entities field first (clean), then the raw extractions,
    // then the legacy payload key. This both saves the user typing it and,
    // crucially, gives reconciliation the registered name it needs.
    const entity = pickEntityName(mergedCase);
    if (entity) setCompanyName((prev) => prev.trim() || entity);
    // Tokens have just been spent on this result — make it survive leaving
    // the flow. Restored on the next mount, cleared when the scorecard is
    // created or the run is discarded.
    writeFlowSnapshot({
      savedAt: new Date().toISOString(),
      companyName: companyName.trim() || entity,
      sector,
      subSector,
      size,
      yearEnd,
      fileNames: readNames,
      filedBatchByFile,
      documentIds: allDocumentIds(),
      documentIdsByName: documentIdsByName(),
      parserCase: mergedCase,
    }, snapshotScope);
    // The read has landed: nothing is left to collect.
    clearPendingRead(snapshotScope);
  };

  /**
   * Ask the server to settle the paid run that just ended — the same call the
   * ESG flow makes. Whatever the run failed to deliver is refunded there,
   * decided from the parser's own record of the run, never from this screen.
   * Resolves the settlement (null when it could not be asked).
   */
  const requestSettlement = async (quoteId: string): Promise<Record<string, any> | null> => {
    try {
      const res = await fetch(`/api/tokens/runs/${encodeURIComponent(quoteId)}/settle-outcome`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      return (await res.json().catch(() => null)) as Record<string, any> | null;
    } catch {
      // The server settles every paid run on its own sweep regardless.
      return null;
    }
  };

  /**
   * Collect a read whose stream was lost. The quote is spent and the run reads
   * on server-side, so the result is ASKED FOR — never re-run, never charged
   * again: still reading → say so and keep asking every 5s; done → finish it
   * exactly as the stream would have; failed or gone → say what happened,
   * whether the tokens come back, and offer a way on.
   */
  const collectRead = async (quoteId: string, uploads: ReadUpload[]): Promise<ReadEnd> => {
    setResumeNotice(RESUME_CHECKING_MESSAGE);
    setReadLost(null);
    const collected = await collectPaidRead(quoteId, {
      onRunning: () => {
        if (mountedRef.current) setResumeNotice(RESUME_RUNNING_MESSAGE);
      },
      isCancelled: () => !mountedRef.current,
    });
    if (!mountedRef.current) return "lost";
    setResumeNotice(null);
    if (collected.status === "done") {
      await completeRead(collected.result as ParserCaseLike, uploads);
      return "delivered";
    }
    // Unreachable: the read may still land — keep the record so "Check again"
    // or a reload can collect it. Anything else is final.
    if (collected.status !== "unreachable") clearPendingRead(snapshotScope);
    const settlement = await requestSettlement(quoteId);
    if (settlement?.state === "settled" && Number(settlement.refundedTokens) > 0) {
      window.dispatchEvent(new CustomEvent("okiru:tokens-changed"));
    }
    setReadLost({
      message: `${uncollectedReadMessage(collected)} ${refundSentence(settlement)}`,
      quoteId,
      canCheckAgain: collected.status === "unreachable",
    });
    return "lost";
  };

  /** Collect a read this page did not start (a retry met "already processed", or a reload found one in flight). */
  const resumeCollect = async (quoteId: string, uploads: ReadUpload[]): Promise<ReadEnd> => {
    setParsing(true);
    setResolving(false);
    setResolveProgress(null);
    setParseError(null);
    try {
      return await collectRead(quoteId, uploads);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not collect the read");
      return "failed";
    } finally {
      setParsing(false);
      setResolving(false);
    }
  };

  /**
   * Step 7: the paid work. Only runs once the quote is paid, and sends the
   * quote id so the server can verify payment and that these are the exact
   * files that were paid for. A dropped connection is not the end of the read:
   * the run carries on server-side and its result is collected instead.
   */
  const runExtraction = async (list: File[], quoteId: string): Promise<ReadEnd> => {
    let end: ReadEnd = "failed";
    setParsing(true);
    setResolving(false);
    setResolveProgress(null);
    setParseError(null);
    setResumeNotice(null);
    setReadLost(null);
    setDocProgress({});
    try {
      await persistSelectedDocuments(list);
      // The read in flight, kept until it lands: what a retry or a reload
      // collects if this connection drops.
      writePendingRead({
        quoteId,
        startedAt: new Date().toISOString(),
        fileNames: list.map((f) => f.name),
        documentIdsByName: Object.fromEntries(
          uploadsOf(list).flatMap((u) => (u.documentId ? [[u.name, u.documentId]] : [])),
        ),
      }, snapshotScope);
      const form = new FormData();
      for (const f of list) form.append("files", f, f.name);
      form.append("case_id", `create_scorecard_${Date.now()}`);
      form.append("quote_id", quoteId);
      // Streaming endpoint: emits per-file doc-start/doc-done SSE events so the
      // list fills up as each document is read, then a single result event.
      let res: Response;
      try {
        res = await fetch("/api/parser/resolve-case-files-stream", {
          method: "POST",
          credentials: "include",
          body: form,
        });
      } catch (err) {
        if (isConnectionLoss(err)) throw new PaidReadInterrupted(quoteId, "connection");
        throw err;
      }
      if (res.status === 402 || res.status === 409 || res.status === 410) {
        const body = await res.json().catch(() => ({}));
        // Spent by a run already going (a double click, a retry): collect it.
        if (res.status === 409 && body?.error?.code === "QUOTE_ALREADY_USED") {
          throw new PaidReadInterrupted(quoteId, "already-used");
        }
        clearPendingRead(snapshotScope);
        throw new Error(body?.error?.message ?? "Payment could not be verified for these documents");
      }
      if (!res.ok || !res.body) throw new Error(`Parser returned ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let data: (ParserCaseLike & { calculator_payload?: Record<string, unknown> }) | null = null;
      let streamError: string | null = null;

      const handle = (event: string, payload: any) => {
        switch (event) {
          case "doc-start":
            if (payload?.fileName) setDocProgress((p) => ({ ...p, [payload.fileName]: "parsing" }));
            break;
          case "doc-done":
            if (payload?.fileName) setDocProgress((p) => ({ ...p, [payload.fileName]: "done" }));
            break;
          case "doc-error":
            if (payload?.fileName) setDocProgress((p) => ({ ...p, [payload.fileName]: "error" }));
            break;
          case "resolving":
            setResolving(true);
            if (typeof payload?.total === "number") setResolveProgress({ done: 0, total: payload.total });
            break;
          case "resolve-progress":
            if (typeof payload?.done === "number" && typeof payload?.total === "number") {
              setResolveProgress({ done: payload.done, total: payload.total });
            }
            break;
          case "result":
            data = payload;
            break;
          case "error":
            streamError = payload?.message ?? "Could not read the documents";
            break;
        }
      };

      // Parse the SSE stream block by block (blocks are separated by a blank line).
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (isConnectionLoss(err)) throw new PaidReadInterrupted(quoteId, "connection");
          throw err;
        }
        const { done, value } = chunk;
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          let eventType = "";
          const dataLines: string[] = [];
          for (const line of block.split(/\r?\n/)) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (eventType && dataLines.length) {
            try { handle(eventType, JSON.parse(dataLines.join("\n"))); } catch { /* ignore keep-alive/comment */ }
          }
        }
      }

      if (streamError) {
        clearPendingRead(snapshotScope);
        throw new Error(streamError);
      }
      // The stream closed without a result or an error: cut on the way (a
      // proxy timeout, a dropped hop). The run may well have finished.
      if (!data) throw new PaidReadInterrupted(quoteId, "no-result");
      await completeRead(data, uploadsOf(list));
      end = "delivered";
    } catch (err) {
      if (err instanceof PaidReadInterrupted) {
        try {
          end = await collectRead(err.quoteId, uploadsOf(list, readPendingRead(snapshotScope)?.documentIdsByName));
        } catch (collectError) {
          setParseError(collectError instanceof Error ? collectError.message : "Could not collect the read");
        }
      } else {
        setParseError(err instanceof Error ? err.message : "Could not read the documents");
      }
    } finally {
      setParsing(false);
      setResolving(false);
    }
    return end;
  };

  /**
   * Settle the paid run that just ended and show what came back. A read that
   * was lost settled itself already, with its own message.
   */
  const settlePaidRun = async (quoteId: string, end: ReadEnd) => {
    if (end === "lost") return;
    const delivered = end === "delivered";
    const body = await requestSettlement(quoteId);
    if (!body) return;
    if (body?.state === "settled" && Number(body.refundedTokens) > 0) {
      setRefundNotice(
        `${Number(body.refundedTokens).toLocaleString("en-ZA")} tokens were returned to your balance. ${body.reason ?? ""}`.trim(),
      );
      window.dispatchEvent(new CustomEvent("okiru:tokens-changed"));
    } else if (body?.state === "pending" && body.queued && body.reason) {
      setRefundNotice(String(body.reason));
    } else if (body?.state === "pending" && !delivered) {
      setRefundNotice(
        "If this run delivered nothing, its tokens come back to your balance automatically — there is nothing you need to do.",
      );
    }
  };

  /**
   * A read whose connection dropped before this page mounted (a reload, a
   * closed tab) is collected on the way in — once, on mount, before any
   * interaction, like the snapshot restore above.
   */
  useEffect(() => {
    const pending = readPendingRead(snapshotScope);
    if (!pending) return;
    const uploads: ReadUpload[] = pending.fileNames.map((name) => ({
      name,
      file: null,
      documentId: pending.documentIdsByName[name] ?? null,
    }));
    void resumeCollect(pending.quoteId, uploads).then((end) => settlePaidRun(pending.quoteId, end));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Step 6: spend tokens, then read.
   *
   * This used to be a card checkout in the middle of the work — quote, redirect
   * to PayFast, come back, hope the ITN landed. Credit replaced it: the
   * organisation has already paid, so processing is one click and the money
   * conversation happens somewhere else entirely.
   *
   * The debit is server-side and idempotent, so a double-click charges once. If
   * the balance will not cover the batch, we say so with the exact shortfall and
   * send them to billing rather than failing vaguely.
   *
   * A batch already processed is not processed again: when the quote is spent
   * (the connection dropped and this is the retry), its read is collected.
   */
  const spendAndExtract = async () => {
    if (!quote) return;
    setPaying(true);
    setParseError(null);
    setRefundNotice(null);
    setReadLost(null);
    try {
      const res = await fetch("/api/tokens/authorize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.quoteId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body?.code === "QUOTE_ALREADY_USED") {
        const pending = readPendingRead(snapshotScope);
        const end = await resumeCollect(
          quote.quoteId,
          uploadsOf(unreadFiles, pending?.quoteId === quote.quoteId ? pending.documentIdsByName : {}),
        );
        await settlePaidRun(quote.quoteId, end);
        return;
      }
      if (res.status === 402) {
        setTokenCost((prev) => (prev ? { ...prev, balance: body?.balance ?? prev.balance, sufficient: false, shortfall: body?.shortfall ?? prev.shortfall } : prev));
        throw new Error(
          `${body?.message ?? "You do not have enough tokens for this batch."} Add tokens in Settings → Billing.`,
        );
      }
      if (!res.ok) throw new Error(body?.message ?? "Could not authorise this batch");

      if (typeof body?.balance === "number") {
        setTokenCost((prev) => (prev ? { ...prev, balance: body.balance, alreadyAuthorized: true } : prev));
      }
      // Every header shows the balance, so it must move the moment it changes.
      window.dispatchEvent(new CustomEvent("okiru:tokens-changed"));
      // Exactly the files this quote priced: the unread ones.
      const end = await runExtraction(unreadFiles, quote.quoteId);
      await settlePaidRun(quote.quoteId, end);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not start processing");
    } finally {
      setPaying(false);
    }
  };

  /**
   * Read without spending (free mode). The authorise call costs nothing here,
   * but it records which organisation started this read — the only thing that
   * lets it collect the result if the connection drops.
   */
  const readFree = async (list: File[], quoteId: string): Promise<ReadEnd> => {
    if (tokenCost?.free) {
      try {
        await fetch("/api/tokens/authorize", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteId }),
        });
      } catch {
        // Reading still works; only collecting after a dropped connection would not.
      }
    }
    return runExtraction(list, quoteId);
  };

  /** After a read that could not be collected: ask again (no charge), or price the documents afresh. */
  const checkLostReadAgain = () => {
    const lost = readLost;
    if (!lost) return;
    const pending = readPendingRead(snapshotScope);
    const uploads = unreadFiles.length > 0
      ? uploadsOf(unreadFiles, pending?.documentIdsByName)
      : (pending?.fileNames ?? []).map((name) => ({ name, file: null, documentId: pending?.documentIdsByName[name] ?? null }));
    void resumeCollect(lost.quoteId, uploads).then((end) => settlePaidRun(lost.quoteId, end));
  };
  const uploadLostReadAgain = () => {
    setReadLost(null);
    clearPendingRead(snapshotScope);
    if (unreadFiles.length > 0) void prepareAndQuote(files);
  };

  /**
   * Whole-folder upload.
   *
   * A folder carries everything — including desktop.ini, thumbnails and
   * whatever else lives alongside the evidence. The same rule as any other
   * pick applies (see `addFiles`): take what we can read, say plainly what was
   * set aside, and let the user decide.
   */
  const addFolder = (incoming: File[], origin?: UploadOrigin) => addFiles(incoming, origin);

  /**
   * A batch was picked. Nothing is staged yet — the double-check dialog gets
   * first look, because the cheapest moment to catch the wrong financial year
   * or another company's certificate is before we have read anything.
   *
   * The folder filter runs on confirmation rather than here, so the dialog
   * shows exactly what was picked and the "some files were skipped" warning
   * still lands afterwards.
   */
  const handleBatchPick = (incoming: File[], origin: UploadOrigin) => {
    if (incoming.length === 0) return;
    setPendingUpload({
      files: incoming,
      batchLabel: origin.batchLabel,
      documentTypeName: origin.documentTypeName,
      fromFolder: origin.fromFolder,
      origin,
    });
  };

  const confirmPendingUpload = () => {
    const pending = pendingUpload;
    setPendingUpload(null);
    if (!pending) return;
    if (pending.fromFolder) addFolder(pending.files, pending.origin);
    else addFiles(pending.files, pending.origin);
  };

  const addFiles = (incoming: File[], origin?: UploadOrigin) => {
    // One rule for every way in — the drop zone, a picked file, a folder, a
    // checklist group. The pickers no longer filter (a greyed-out file is a
    // silent refusal), so this is where the sorting happens, out loud:
    //  - OS bookkeeping (Thumbs.db, .DS_Store) is dropped silently;
    //  - Office lock files (~$Book.xlsx) and resource forks get one neutral
    //    line — they look like documents and are not;
    //  - anything the parser cannot open is named, with what to do about it.
    // Before, a lock file failed the whole quote with "Failed to fetch".
    const sorted = sortPickedFiles(incoming);
    setTemporaryNotice(sorted.temporary.length > 0 ? temporarySentence(sorted.temporary) : null);
    setSkippedFiles(sorted.unreadable);
    const usable = sorted.usable;
    if (usable.length === 0) return;
    const next = [...files];
    for (const f of usable) {
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    if (next.length > MAX_UPLOAD_FILES) {
      quoteRequestRef.current += 1;
      setParseError(`You can upload up to ${MAX_UPLOAD_FILES} documents at once. Remove ${next.length - MAX_UPLOAD_FILES} and try again.`);
      setQuote(null);
      setQuoting(false);
      return;
    }
    setFiles(next);
    // A batch you have just changed is a batch you are still working on, so
    // adding or removing a document always returns you to staging rather than
    // leaving you looking at a checkout for a different set of files.
    setDoneStaging(false);
    // Remember which batch each file was filed under so every card can show its
    // own pile. Presentation only: the classifier still decides what a document
    // is, and a misfiled one is still scored where it belongs.
    if (origin) {
      setFiledBatchByFile((prev) => {
        const merged = { ...prev };
        for (const f of usable) merged[f.name] = origin.batchId;
        return merged;
      });
    }
    void prepareAndQuote(next);
  };

  const removeFile = (name: string) => {
    // A read file is paid for and folded into the case; taking it off the list
    // would leave its values in the scorecard with no document behind them.
    const target = files.find((f) => f.name === name);
    if (target && !isUnread(target)) return;
    const next = files.filter((f) => f.name !== name);
    setFiles(next);
    // A batch you have just changed is a batch you are still working on, so
    // adding or removing a document always returns you to staging rather than
    // leaving you looking at a checkout for a different set of files.
    setDoneStaging(false);
    setFiledBatchByFile((prev) => {
      const merged = { ...prev };
      delete merged[name];
      return merged;
    });
    quoteRequestRef.current += 1;
    setQuote(null);
    // Re-price what is still unread. This used to reset the case to an earlier
    // round when the list emptied — after a read, that threw the paid result away.
    if (next.some(isUnread)) void prepareAndQuote(next);
    else setQuoting(false);
  };

  const groupSatisfied = (g: { types: string[] }) => g.types.some((t) => docTypeSatisfied(t));

  // Reveal stats.
  //
  // Every counter here must read the SAME source of truth the header and the
  // Create button use — the UNION of the legacy mapper and the AI-entity path.
  // The bug this replaces: the tiles read only `mapped` (legacy) while the
  // header read `totalMappedRows` (both), so the panel said "45 placed" and
  // "12 values extracted" at once, and the pillar rack lit only Procurement
  // (the one pillar the legacy path handled) while the AI path's ownership /
  // management / skills rows showed as "—". Same data, two counters, one lying.

  /** Rows the AI-entity path produced, added to the legacy mapper's count. */
  const injectedRowCount = useMemo(
    () => (injected ? Object.values(injected.rows).reduce((n, r) => n + (r?.length ?? 0), 0) : 0),
    [injected],
  );
  const totalMappedRows = (mapped?.mappedRowCount ?? 0) + injectedRowCount;

  /**
   * Required document groups we still have nothing for, split by whether the
   * parser could read one if the user supplied it. An evidence-only group is
   * guidance for the verifier, never something we could have detected, so the
   * two are never presented as the same kind of gap.
   */
  const missingDocGroups = useMemo(() => {
    const groups = catalog?.required_groups ?? [];
    return {
      detectable: groups.filter((g) => g.required !== false && g.autoExtract && !groupSatisfied(g)),
      evidenceOnly: groups.filter((g) => g.required !== false && !g.autoExtract),
    };
    // groupSatisfied reads the current parser case, which `parserCase` covers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, parserCase]);

  /** Pillars where a figure was read but cannot score without per-person rows. */
  const needsDetailPillars = useMemo(
    () => (mapped?.coverage ?? []).filter((c) => c.status === "needs-detail" && c.extractedValue),
    [mapped],
  );

  /**
   * The review: one entry per document — what we took, what we read but could
   * not place, and why anything was not read — built from the same merged
   * sections the Build button creates the workbook from.
   */
  const reviewDocuments = useMemo(() => {
    if (!parserCase) return [];
    const sections = mergeWorkbookSections(mapped?.sections ?? {}, injected ? toWorkbookSections(injected) : {});
    const failedFiles = Object.entries(docProgress)
      .filter(([, status]) => status === "error")
      .map(([name]) => name);
    return buildDocumentReview(
      {
        parserCase,
        sections: sections as Record<string, { rows?: unknown[] }>,
        rejected: injected?.rejected ?? [],
        flags: reconciliationFlags,
        failedFiles,
      },
      "a B-BBEE scorecard",
    );
  }, [parserCase, mapped, injected, reconciliationFlags, docProgress]);

  // Suppliers + spend come from whichever path actually read the procurement
  // schedule: the AI-entity path is authoritative where it has rows (it is what
  // scores), the legacy supplier_rows are the fallback. Reading only the legacy
  // shape is why "8 suppliers found" could sit next to a Procurement pillar the
  // AI path had already filled — or show 0 when only the AI path read them.
  const injectedProcurement = (injected?.rows?.procurement ?? []) as Array<Record<string, unknown>>;
  const supplierCount = injectedProcurement.length > 0
    ? injectedProcurement.length
    : (parserCase?.supplier_rows?.length ?? 0);
  const spendCaptured = injectedProcurement.length > 0
    ? injectedProcurement.reduce((s, r) => s + (Number(String(r.spend ?? "").replace(/[^0-9.]/g, "")) || 0), 0)
    : (parserCase?.supplier_rows ?? []).reduce(
        (s, r) => s + (Number(String(r.spend_amount ?? 0).replace(/[^0-9.]/g, "")) || 0),
        0,
      );


  // `files.length` OR a restore: File objects never survive navigation, so a
  // rehydrated run must reveal from the case alone.
  const revealed = Boolean((mapped || injected) && !parsing && (files.length > 0 || restoredAt));
  /** Whether reading the unread files spends tokens (the read bar works out whether the balance covers it). */
  const readCharging = Boolean(quote && quote.paymentRequired !== false && tokenCost !== null);
  /**
   * Read the unread files — one click from the bar under the uploader.
   *
   * There used to be two money gates: "Done adding — review cost", then a
   * checkout page with its own "Read my documents". The price is known the
   * moment the files are staged, so the bar shows it and reads from there; the
   * full breakdown is still one click away for anyone who wants it.
   */
  const readNow = () => {
    if (!quote) return;
    if (readCharging) void spendAndExtract();
    else void readFree(unreadFiles, quote.quoteId);
  };
  /**
   * Nothing on screen but the dropzone: the state a user lands in when they
   * chose "upload documents" and have not yet added one. The company profile
   * and the pillar batches both matter, and both appear the moment there is a
   * file for them to apply to.
   */
  const bareUpload = focused && files.length === 0 && !parserCase && !quote;
  // Missing documents never block: the user can always proceed and the workbook
  // scores on whatever was extracted (even nothing — they complete it manually).
  // Sector + size are REQUIRED: they pick the scorecard the company is judged
  // against, so creating without them is never a safe default. The year end is
  // required for the same reason — it picks the period every dated pillar is
  // measured over, and the workbook will not calculate without one.
  const yearEndValid = parseWorkbookDate(yearEnd) !== null;
  // A document added after the read but never read would be filed under the
  // company with nothing taken from it — the forgotten document, forgotten
  // again. Read it or remove it first.
  const canCreate =
    Boolean(companyName.trim()) && Boolean(sector) && Boolean(size) && yearEndValid &&
    unreadFiles.length === 0 && !parsing && !creating;

  // Create the scorecard, stamping the chosen sector into company-information
  // meta so the workbook scores under the correct sector calculator (Generic /
  // Construction / FSC / Transport …) rather than always defaulting to Generic.
  const handleCreate = async () => {
    if (!mapped && !injected) return;

    // The parser returns BOTH shapes: the deterministic case result and the
    // AI-entity extractions. Where the AI-entity path read a whole schedule
    // (every supplier / shareholder / beneficiary) its rows are authoritative and
    // REPLACE the legacy rows for that section — adding them double-counts the
    // same evidence once it scores. Legacy rows survive for sections the AI path
    // left empty; meta is merged with the legacy (deterministic) value winning.
    const sections: Record<string, { rows?: unknown[]; meta?: Record<string, unknown> }> = mergeWorkbookSections(
      mapped?.sections ?? {},
      injected ? toWorkbookSections(injected) : {},
    );

    const companyMeta: Record<string, unknown> = {
      companyName: companyName.trim(),
      industrySector: SECTOR_TO_WORKBOOK[sector] ?? "Generic",
      scorecardType: size,
      financialYearEnd: yearEnd,
    };
    if (sector === "CONSTRUCTION" && subSector) companyMeta.constructionSubSector = subSector;
    if (sector === "FSC" && subSector) companyMeta.fscSubSector = subSector;
    sections["company-information"] = {
      ...(sections["company-information"] ?? {}),
      meta: { ...(sections["company-information"]?.meta ?? {}), ...companyMeta },
    };

    // AUTO-DETECT AGAINST THE CERTIFICATE REGISTRY.
    //
    // The reveal has normally already done this and the enriched rows are
    // waiting in `certificateFill` — reuse them so what the user was shown is
    // exactly what gets created. Only if the lookup has not finished (or the
    // rows changed under it) is it run inline here, through the same function,
    // so the two paths can never diverge.
    const procurementRows = (sections.procurement?.rows ?? []) as ProcurementRow[];
    if (procurementRows.length > 0) {
      const enriched = certificateFillCoversRows(certificateFill?.rows, procurementRows)
        ? certificateFill!.rows
        : (await autofillProcurementFromCertificates(procurementRows)).rows;
      sections.procurement = { ...(sections.procurement ?? {}), rows: enriched };
    }

    // RECONCILE before anything is saved or scored: assemble the extracted facts
    // into one coherent entity that satisfies the domain invariants (a company
    // is not its own shareholder; ownership closes to 100%; one ID is one
    // person; a share carries its economic interest by flow-through; dates are
    // dates). Scoring only ever runs on the reconciled sections. The issue list
    // is the honest, plain-language explanation the review page renders.
    const reconciled = reconcileEntity(sections as any, {
      sectorCode: sector,
      scorecardType: size,
      // All the entity's names/numbers from the documents, so the self-
      // shareholder check matches the registered name even when the user's
      // display name differs.
      entityAliases: [companyName.trim(), ...(parserCase ? collectEntityAliases(parserCase) : [])].filter(Boolean),
    });
    const finalSections = reconciled.sections as Record<string, { rows?: unknown[]; meta?: Record<string, unknown> }>;

    // Verdicts assessed against the RECONCILED sections so the ledger reflects
    // the cleaned entity, not the raw extraction.
    const verdicts =
      parserCase || Object.values(finalSections).some((s) => (s.rows?.length ?? 0) > 0)
        ? assessDocuments(parserCase ?? {}, finalSections as Record<string, { rows?: unknown[] }>)
        : undefined;
    try {
      await onCreate(companyName.trim(), finalSections, {
        verdicts,
        reconcile: reconciled,
        // Everything this run put in the document library, restored ids
        // included — so the host can file the uploads under the company.
        documentIds: allDocumentIds(),
      });
      // The run is now a company; the snapshot has served its purpose. Cleared
      // only after create resolves so a failure leaves the restore intact.
      clearFlowSnapshot(snapshotScope);
    } catch {
      // The host surfaces its own create errors; keeping the snapshot means
      // the paid extraction survives to try again.
    }
  };

  /** Throw the restored (or just-extracted) run away and start clean. */
  const discardRun = () => {
    clearFlowSnapshot(snapshotScope);
    clearPendingRead(snapshotScope);
    setReadLost(null);
    setParserCase(null);
    setReadKeys(new Set());
    setRestoredAt(null);
    restoredDocumentIdsRef.current = [];
    setFiles([]);
    setFiledBatchByFile({});
    setQuote(null);
    setTokenCost(null);
    setDoneStaging(false);
    setCompanyName("");
  };

  /**
   * Pillar rack coverage — merged across BOTH paths, stronger status wins.
   *
   * The legacy `mapped.coverage` sees only what the deterministic mapper placed
   * (here: Procurement). The AI-entity path carries its OWN `injected.coverage`
   * for ownership / management / skills / SED, which the rack used to ignore —
   * so those pillars showed "—" while their rows were already in the workbook.
   * A pillar is covered if EITHER path covers it; we keep the strongest status
   * so "mapped" from one path is never hidden by "no-document" from the other.
   */
  const coverageByPillar = useMemo(() => {
    const rank: Record<string, number> = { mapped: 3, "needs-detail": 2, "no-document": 1 };
    const merged: Record<string, { pillar: string; status: string; detail?: string; extractedValue?: string }> =
      Object.fromEntries((mapped?.coverage ?? []).map((c) => [c.pillar, { ...c }]));
    // The AI-entity path reports coverage as row/meta presence, not per-pillar
    // items, so light a pillar from its section rows. A section with rows IS
    // mapped — that is exactly the ownership / management / skills evidence the
    // legacy rack showed as "—".
    const SECTION_TO_PILLAR: Record<string, string> = {
      ownership: "Ownership",
      "management-control": "Management Control",
      "skills-development": "Skills Development",
      procurement: "Preferential Procurement",
      esd: "Preferential Procurement",
      sed: "Socio-Economic Development",
    };
    const lift = (pillar: string, detail: string) => {
      const prev = merged[pillar];
      if (!prev || (rank[prev.status] ?? 0) < rank.mapped) {
        merged[pillar] = { pillar, status: "mapped", detail: prev?.detail ?? detail, extractedValue: prev?.extractedValue };
      }
    };
    if (injected) {
      const injectedRows = injected.rows as Record<string, unknown[]>;
      for (const [sectionKey, pillar] of Object.entries(SECTION_TO_PILLAR)) {
        const rows = injectedRows?.[sectionKey] ?? [];
        if (rows.length > 0) lift(pillar, `${rows.length} row${rows.length === 1 ? "" : "s"} extracted`);
      }
      // Financials land as META (revenue / NPAT / payroll / TMPS), never rows —
      // light the pillar when that meta was captured.
      const finMeta = injected.meta?.["financial-information"];
      if (finMeta && Object.keys(finMeta).length > 0) lift("Financials", "financials extracted");
    }
    return merged;
  }, [mapped, injected]);

  const sizeOptions = [
    { value: "Generic", label: "Large / Generic", detail: "Annual turnover above R50m" },
    { value: "QSE", label: "QSE", detail: "Annual turnover R10m to R50m" },
    { value: "EME", label: "EME", detail: "Annual turnover below R10m" },
  ];

  // ── What is on screen ────────────────────────────────────────────────────
  // Every step does one job and has one filled button: Upload files (empty),
  // Read N documents (staged), nothing while reading, Build scorecard after.
  // Anything not needed for the next decision sits behind a closed "details".
  const readBarState: ReadBarState = quoting ? "pricing" : quote ? "priced" : "failed";
  const showReadBar = unreadFiles.length > 0 && !parsing;
  /** A pricing failure is said in the read bar, so it is not said again below. */
  const pricingFailedInBar = showReadBar && readBarState === "failed";
  /** The checklist and company details: before the first read only, never while reading. */
  const showStageExtras = !bareUpload && !parsing && !parserCase;

  /** One row of the file list: a name, one status word and its own action. */
  const rowFor = (f: File): DocumentListRow => {
    const perFile = docProgress[f.name];
    const alreadyRead = !isUnread(f);
    const detected = (parserCase?.documents_detected ?? []).find((d) => d.filename === f.name);
    const missing = parsing ? { fields: [] as string[], notes: [] as string[] } : docMissingContent(f.name);
    const hasGaps = missing.fields.length > 0 || missing.notes.length > 0;
    const quotedFile = quoted(f.name);
    // A round reads only the new files; the ones already read keep their verdict.
    const status: DocumentStatus =
      parsing && !alreadyRead
        ? perFile === "done"
          ? "read"
          : perFile === "error"
            ? "failed"
            : resolving
              ? "read"
              : "reading"
        : perFile === "error"
          ? "failed"
          : detected
            ? detected.status === "passed" && !hasGaps
              ? "read"
              : detected.status === "review_required" || hasGaps
                ? "needs-look"
                : "failed"
            : "ready";
    const gaps = [
      missing.fields.length > 0
        ? `Not read: ${missing.fields.slice(0, 4).join(", ")}${missing.fields.length > 4 ? ` +${missing.fields.length - 4}` : ""}`
        : "",
      missing.notes.slice(0, 1).join("; "),
    ].filter(Boolean).join(" · ");
    return {
      name: f.name,
      status,
      details: [
        filedBatchByFile[f.name] ? `Added to ${batchLabel(filedBatchByFile[f.name])}` : "",
        quotedFile ? fileUnits(quotedFile) : "",
        quotedFile?.requiresOcr ? "scanned" : "",
      ].filter(Boolean),
      error:
        status === "failed"
          ? parsing
            ? "We couldn't read this file. The rest carry on."
            : "We couldn't read this file. Replace it with a clearer copy, or remove it."
          : null,
      removable: !alreadyRead,
      gaps: hasGaps ? gaps : null,
    };
  };
  const listFiles = revealed ? unreadFiles : files;

  const restoredLabel = (() => {
    if (!restoredAt) return "";
    const at = new Date(restoredAt);
    return Number.isNaN(at.getTime())
      ? ""
      : ` from ${at.toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  })();

  const readBar = showReadBar ? (
    <ReadBar
      testIdPrefix=""
      count={unreadFiles.length}
      newRound={Boolean(parserCase)}
      state={readBarState}
      charging={readCharging}
      free={quote?.paymentRequired === false}
      tokenCost={tokenCost}
      failureDetail={parseError}
      costOpen={doneStaging}
      onToggleCost={() => setDoneStaging((open) => !open)}
      onRetry={() => void prepareAndQuote(files)}
      onRead={readNow}
      busy={paying || parsing}
    >
      {quote && (
        <CostDetails
          testIdPrefix=""
          files={quote.files}
          tokenCost={tokenCost}
          charging={readCharging}
          isUpperBound={quote.totals?.isUpperBound}
          expiresAt={quote.expiresAt}
          onRead={() => void (readCharging ? spendAndExtract() : readFree(unreadFiles, quote.quoteId))}
          busy={paying || parsing}
        />
      )}
    </ReadBar>
  ) : null;

  const fileList =
    !parsing && listFiles.length > 0 ? (
      <DocumentList
        testIdPrefix=""
        className="mt-3"
        rows={listFiles.map(rowFor)}
        onRemove={removeFile}
        onReplace={() => inputRef.current?.click()}
      />
    ) : null;

  // Set-aside files: one line under the list, never a red error.
  const pickNotices = (
    <>
      {skippedFiles.length > 0 && (
        <div className="mt-2 text-[12px] leading-5 text-amber-200/90" data-testid="skipped-files-warning">
          <Disclosure
            summary={
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
                {unreadableSentence(skippedFiles)}
              </span>
            }
            summaryClassName="text-[12px] font-normal text-amber-200/90"
          >
            <p className="pl-5 font-mono text-[11px] text-[color:var(--body)]">{skippedFiles.join(", ")}</p>
          </Disclosure>
        </div>
      )}
      {temporaryNotice && (
        <p className="mt-2 text-[12px] leading-5 text-[color:var(--body)]" data-testid="skipped-temporary-files">
          {temporaryNotice}
        </p>
      )}
    </>
  );

  /** What happened to a paid run, said once wherever the screen is. */
  const runNotices = (
    <>
      {readLost && !parsing && (
        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-500/[0.06] px-4 py-3" data-testid="read-lost" role="alert">
          <p className="text-[12px] leading-5 text-amber-100">{readLost.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {readLost.canCheckAgain && (
              <button
                type="button"
                onClick={checkLostReadAgain}
                className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--body)] hover:bg-white/[0.04]"
                data-testid="button-read-check-again"
              >
                Check again
              </button>
            )}
            <button
              type="button"
              onClick={uploadLostReadAgain}
              className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--body)] hover:bg-white/[0.04]"
              data-testid="button-read-upload-again"
            >
              Upload the documents again
            </button>
          </div>
        </div>
      )}
      {refundNotice && (
        <p className="mt-3 text-[12px] leading-5 text-emerald-200/90" role="status" data-testid="bbbee-refund-notice">
          {refundNotice}
        </p>
      )}
    </>
  );

  return (
    <div data-testid="document-upload-start">
      {/* No `accept` on either picker: any file can be chosen, and whatever
          the parser cannot open is named after the pick (see addFiles). */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(Array.from(e.target.files));
          e.currentTarget.value = "";
        }}
        data-testid="docs-file-input"
      />
      {/* Whole-folder upload. Clients keep their evidence in a folder, not as a
          hand-picked list, and making them select 26 files one by one is how
          documents get left out. */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        // Non-standard but supported everywhere that matters; React needs
        // these lowercased via the DOM attribute spelling.
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(e) => {
          if (e.target.files?.length) addFolder(Array.from(e.target.files));
          e.currentTarget.value = "";
        }}
        data-testid="docs-folder-input"
      />

      {/* Left-aligned and at document scale: a step in an assessment, not a
          landing page. The cost line is said here once. */}
      <div className="mb-4">
        <h3 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-white">
          {parserCase || (!addMode && files.length > 0)
            ? "Your documents"
            : addMode
              ? `Add documents to ${existingCompany!.name}`
              : "Add your documents"}
        </h3>
        <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--body)]">
          {parserCase
            ? "Read and placed. Check anything marked, then build."
            : parsing
              ? "Long or scanned documents can take a few minutes."
              : "We'll show the cost before anything is read."}
        </p>
      </div>

      {parsing ? (
        // While reading: one calm line; the files are behind "Show documents".
        <StatusLine
          testIdPrefix=""
          containerRef={extractionPhaseRef}
          total={unreadFiles.length}
          done={Object.values(docProgress).filter((s) => s === "done").length}
          failed={Object.values(docProgress).filter((s) => s === "error").length}
          checking={resolving}
          checkProgress={resolveProgress}
          notice={resumeNotice}
        >
          {unreadFiles.length > 0 ? (
            <DocumentList testIdPrefix="" rows={unreadFiles.map(rowFor)} onRemove={removeFile} locked />
          ) : null}
        </StatusLine>
      ) : revealed ? (
        // A round after a read: the new documents and the bar that reads them,
        // straight under the heading.
        <>
          {readBar}
          {fileList}
          {pickNotices}
          {unreadFiles.length > 0 && (
            <div className="mt-3">
              <UploadSurface
                testIdPrefix=""
                staged
                lead=""
                onPickFiles={() => inputRef.current?.click()}
                onPickFolder={() => folderInputRef.current?.click()}
                onDropFiles={(dropped) => addFiles(dropped)}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <UploadSurface
            testIdPrefix=""
            staged={files.length > 0}
            lead="Drop files or a folder."
            onPickFiles={() => inputRef.current?.click()}
            onPickFolder={() => folderInputRef.current?.click()}
            onDropFiles={(dropped) => addFiles(dropped)}
          />
          {parseError && !pricingFailedInBar && (
            <p className="mt-2 text-[12px] leading-5 text-red-300" role="alert" data-testid="parse-error">
              {parseError}
            </p>
          )}
          {readBar}
          {fileList}
          {pickNotices}
        </>
      )}

      {runNotices}
      {!revealed && libraryWarning && (
        <p className="mt-3 text-[12px] leading-5 text-[color:var(--body)]" role="status">{libraryWarning}</p>
      )}

      {/* The checklist and the company profile: before the first read, closed.
          Neither is needed to upload — the checklist is guidance, and sector
          and size are asked for again on the Build bar after the read. */}
      {showStageExtras && (
        <>
          <PillarDocumentBatches
            satisfiedDocumentIds={satisfiedDocumentIds}
            filedBatchByFile={filedBatchByFile}
            stagedFileNames={files.map((f) => f.name)}
            onPick={handleBatchPick}
            disabled={parsing}
          />
          <Disclosure
            summary="Company details"
            meta="optional now, needed before you build"
            className="mt-3 rounded-[18px] border border-white/[0.07] bg-[color:var(--ink-2)] px-4 py-3"
            summaryClassName="text-[13px]"
            testId="company-details"
          >
            <p className="text-[12px] leading-5 text-[color:var(--body)]">
              Sector and size decide which scorecard rules apply, and tailor the checklist above.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {sectorOptions.length > 0 && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-[color:var(--body)]">Sector</span>
                    <select
                      value={sector}
                      onChange={(e) => {
                        setSector(e.target.value);
                        setSubSector("");
                      }}
                      className="h-10 w-full rounded-xl border border-white/[0.08] bg-[color:var(--ink-3)] px-3 text-[13px] text-white outline-none focus:border-white/25 focus:ring-2 focus:ring-white/[0.05]"
                      data-testid="sector-select-side"
                    >
                      <option value="">Select sector…</option>
                      {sectorOptions.map((s) => (
                        <option key={s.code} value={s.code}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                  {activeSector?.subSectors && (
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[color:var(--body)]">Sub-sector</span>
                      <select
                        value={subSector}
                        onChange={(e) => setSubSector(e.target.value)}
                        className="h-10 w-full rounded-xl border border-white/[0.08] bg-[color:var(--ink-3)] px-3 text-[13px] text-white outline-none focus:border-white/25 focus:ring-2 focus:ring-white/[0.05]"
                        data-testid="subsector-select-side"
                      >
                        <option value="">Select</option>
                        {activeSector.subSectors.map((ss) => (
                          <option key={ss.value} value={ss.value}>{ss.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
              <fieldset>
                <legend className="mb-1.5 text-[12px] font-medium text-[color:var(--body)]">Organisation size</legend>
                <div className="space-y-1">
                  {sizeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSize(option.value)}
                      aria-pressed={size === option.value}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-colors duration-200 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      data-testid={`size-option-side-${option.value}`}
                    >
                      <span>
                        <span className="block font-medium text-white">{option.label}</span>
                        <span className="block text-[11px] text-[color:var(--muted)]">{option.detail}</span>
                      </span>
                      {size === option.value && <Check className="h-3.5 w-3.5 text-[color:var(--body)]" />}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </Disclosure>
        </>
      )}

      {/* Double-check before anything from a checklist group is staged. */}
      <ConfirmUploadDialog
        pending={pendingUpload}
        onConfirm={confirmPendingUpload}
        onCancel={() => setPendingUpload(null)}
      />

      {revealed && (
        <div className="mt-4 space-y-4">
          {/* A restored run announces itself — coming back to data you don't
              remember paying for otherwise looks like a glitch — and offers
              the way out. */}
          {restoredAt && parserCase && (
            <div
              className="flex flex-col gap-2 rounded-[18px] border border-white/[0.08] bg-[color:var(--ink-3)] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              data-testid="restored-run-banner"
            >
              <p className="flex items-center gap-2 text-[12.5px] leading-5 text-[color:var(--body)]">
                <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                Restored your last read{restoredLabel}. No tokens were spent again.
              </p>
              <button type="button" onClick={discardRun} className={textButton("sm")} data-testid="button-discard-restored-run">
                Discard and start over
              </button>
            </div>
          )}

          {/* ── THE ONE THING THAT NEEDS A DECISION ────────────────────────
              Figures the documents disagree on stay above the Build button and
              are never collapsed: a withheld figure leaves a hole in the score,
              and the person who can close it is standing here. The only amber
              panel above Build. */}
          {(injected?.metaConflicts.length ?? 0) > 0 && (
            <div className="rounded-xl border border-amber-300/25 bg-amber-400/[0.05] px-4 py-3 text-left" data-testid="meta-conflicts">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                Your documents disagree on {injected!.metaConflicts.length} figure
                {injected!.metaConflicts.length === 1 ? "" : "s"}.
              </p>
              <p className="mt-0.5 text-[12px] leading-5 text-[color:var(--body)]">
                We left {injected!.metaConflicts.length === 1 ? "it" : "them"} blank. Pick the right one in the workbook.
              </p>
              {/* One candidate per line: comparing two numbers on one wrapping
                  run of text is where the wrong one gets picked. */}
              <div className="mt-2 space-y-2">
                {injected!.metaConflicts.map((c) => (
                  <div key={`${c.section}.${c.column}`} className="rounded-lg border border-white/[0.06] bg-[color:var(--ink-2)] px-3 py-2">
                    <p className="text-[12px] font-medium text-[color:var(--hi)]">{c.column}</p>
                    <ul className="mt-1 space-y-0.5">
                      {c.candidates.map((cand, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12px] leading-5">
                          <span className="tabular-nums text-white">{String(cand.value)}</span>
                          <span className="text-[11px] text-[color:var(--muted)]">{cand.sources.join(", ") || "unknown source"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BUILD — the company, the rules it is scored under and the year it
              is measured over, in one bar above the review. Missing documents
              never block building: the workbook scores on what we have. */}
          <div className="rounded-2xl border border-white/[0.08] bg-[color:var(--ink-2)] p-3" data-testid="build-bar">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] lg:items-end">
              <label className="min-w-0">
                <span className="mb-1 block text-[11px] font-medium text-[color:var(--muted)]">Company</span>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  readOnly={addMode}
                  placeholder="e.g. Acme Holdings (Pty) Ltd"
                  className="h-10 w-full rounded-xl border border-[color:var(--rule)] bg-[color:var(--ink-3)] px-3 text-[13.5px] text-white placeholder-[color:var(--muted)] outline-none transition-colors focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10 read-only:text-[color:var(--body)]"
                  data-testid="docs-company-name"
                />
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[11px] font-medium text-[color:var(--muted)]">Sector</span>
                {/* Sector and sub-sector in one control: a second select that
                    appears only for two sectors made the row jump. */}
                <select
                  value={activeSector?.subSectors && subSector ? `${sector}::${subSector}` : sector}
                  onChange={(e) => {
                    const [code, sub = ""] = e.target.value.split("::");
                    setSector(code);
                    setSubSector(sub);
                  }}
                  className="h-10 w-full rounded-xl border border-[color:var(--rule)] bg-[color:var(--ink-3)] px-2.5 text-[13px] text-white outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10"
                  data-testid="sector-select-build"
                >
                  <option value="">Select sector…</option>
                  {sectorOptions.map((s) =>
                    s.subSectors?.length ? (
                      <optgroup key={s.code} label={s.label}>
                        <option value={s.code}>{s.label}</option>
                        {s.subSectors.map((ss) => (
                          <option key={ss.value} value={`${s.code}::${ss.value}`}>
                            {s.label} · {ss.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      <option key={s.code} value={s.code}>{s.label}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[11px] font-medium text-[color:var(--muted)]">Size</span>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[color:var(--rule)] bg-[color:var(--ink-3)] px-2.5 text-[13px] text-white outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10"
                  data-testid="size-select-build"
                >
                  <option value="">Select size…</option>
                  {sizeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label} — {o.detail.replace(/^Annual turnover /, "")}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-0" data-testid="docs-year-end-field">
                <span className="mb-1 block text-[11px] font-medium text-[color:var(--muted)]">Financial year-end</span>
                <input
                  type="date"
                  value={yearEnd}
                  onChange={(e) => setYearEnd(e.target.value)}
                  className={`h-10 w-full rounded-xl border bg-[color:var(--ink-3)] px-3 text-[13.5px] text-white outline-none transition-colors focus:ring-2 focus:ring-violet-500/10 [color-scheme:dark] ${
                    yearEndValid ? "border-[color:var(--rule)] focus:border-violet-500/50" : "border-amber-400/40 focus:border-amber-400/60"
                  }`}
                  data-testid="docs-year-end"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!canCreate}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 text-[13.5px] font-semibold text-black transition-colors duration-200 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-400/30 disabled:cursor-not-allowed disabled:bg-[color:var(--ink-3)] disabled:text-[color:var(--muted)] sm:col-span-2 lg:col-span-1"
                data-testid="button-create-from-documents"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                {addMode ? "Add to the workbook" : "Build scorecard"}
              </button>
            </div>

            {/* Only what stops the build, or what changes how it is scored —
                said once, under the bar. The happy path shows nothing here. */}
            {(!sector || !size || activeSector?.provisional || unreadFiles.length > 0 || !yearEndValid || workbookMismatches.length > 0 || certificateFillRunning || addMode) && (
              <div className="mt-2.5 space-y-1 border-t border-white/[0.05] pt-2.5 text-[11.5px] leading-5">
                {/* The workbook states a different sector or year end from the
                    one chosen here. The choice here stands. */}
                {workbookMismatches.map((m) => (
                  <p key={m.field} className="text-amber-300/90" data-testid={`workbook-mismatch-${m.field}`}>
                    {m.field === "sector"
                      ? `Your workbook's Instructions sheet says the sector is ${m.workbook}; you chose ${activeSector?.label ?? m.form}.`
                      : `Your workbook's Instructions sheet says the financial year-end is ${m.workbook}; you entered ${m.form}.`}{" "}
                    We use yours — change it if the workbook is right.
                  </p>
                ))}
                {(!sector || !size) && (
                  <p className="text-amber-300/90" data-testid="scoring-as-line">
                    Choose the sector and size — they decide which scorecard rules your documents are scored against.
                  </p>
                )}
                {!yearEndValid && (
                  <p className="text-amber-300/90" data-testid="docs-year-end-hint">
                    Year-end required — Skills, Procurement, ESD and SED are measured over the twelve months ending on
                    this date, so the score cannot be calculated without it.
                  </p>
                )}
                {unreadFiles.length > 0 && (
                  <p className="text-amber-300/90" data-testid="docs-unread-hint">
                    {unreadFiles.length} document{unreadFiles.length === 1 ? " you added has" : "s you added have"} not
                    been read yet — read {unreadFiles.length === 1 ? "it" : "them"} above, or remove{" "}
                    {unreadFiles.length === 1 ? "it" : "them"}, before building.
                  </p>
                )}
                {/* A sector whose ladder was applied by analogy says so next to
                    the button that builds the scorecard — not in a footnote. */}
                {activeSector?.provisional && (
                  <p className="flex items-start gap-1.5 text-amber-200/80" data-testid="sector-provisional-note">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
                    <span>{activeSector.provisionalNote}</span>
                  </p>
                )}
                {certificateFillRunning && (
                  <p className="flex items-center gap-1.5 text-[color:var(--body)]" data-testid="certificate-autofill-running">
                    <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />
                    Checking supplier certificates…
                  </p>
                )}
                {addMode && (
                  <p className="text-[color:var(--muted)]">
                    Blanks in the workbook take these values. Nothing already there is overwritten — where a document
                    disagrees, you’ll see both and we keep yours.
                  </p>
                )}
              </div>
            )}
            {(parseError || libraryWarning) && (
              <p className="mt-2 text-[11.5px] leading-5 text-[color:var(--body)]" role="status" data-testid="docs-notice">
                {[parseError, libraryWarning].filter(Boolean).join(" ")}
              </p>
            )}
          </div>

          {/* What we found, by pillar, in one row — and what is not here yet. */}
          {mapped && (
            <div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5" data-testid="coverage-preview" aria-label="What we found, by pillar">
                {PILLAR_TILES.map((tile) => {
                  const c = coverageByPillar[tile.pillar];
                  const status = c?.status ?? "no-document";
                  const lit = status === "mapped";
                  const partial = status === "needs-detail";
                  return (
                    <li
                      key={tile.pillar}
                      className={`inline-flex items-center gap-1.5 text-[12.5px] ${lit ? "text-[color:var(--hi)]" : partial ? "text-amber-200" : "text-[color:var(--muted)]"}`}
                      title={c ? `${tile.pillar}: ${c.detail}${c.extractedValue ? ` (read: ${c.extractedValue})` : ""}` : tile.pillar}
                    >
                      {lit ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                      ) : partial ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                      ) : (
                        <Minus className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {tile.short}
                      <span className="sr-only">{lit ? ": found" : partial ? ": needs more detail" : ": not in this pack"}</span>
                    </li>
                  );
                })}
              </ul>
              {(missingDocGroups.detectable.length > 0 || needsDetailPillars.length > 0) && (
                <p className="mt-1.5 text-[12px] leading-5 text-[color:var(--body)]" data-testid="review-still-to-add">
                  <span className="font-medium text-white">Not in this pack yet:</span>{" "}
                  {[
                    ...missingDocGroups.detectable.map((g) => g.label),
                    ...needsDetailPillars.map((c) => `${c.pillar}: we read ${c.extractedValue}, but it needs per-person rows to score.`),
                  ].join(" · ")}
                </p>
              )}
            </div>
          )}

          {/* THE REVIEW — each document beside what we took from it, worst
              first, at a fixed height. Optional: Build never waits for it. Its
              "Add documents" is the one way to add a forgotten document here. */}
          <DocumentReview
            documents={reviewDocuments}
            fileFor={(name) => files.find((f) => f.name === name) ?? null}
            documentIdFor={(name) => documentIdsByName()[name] ?? null}
            onAddDocuments={() => inputRef.current?.click()}
            // A correction here is what gets built: it rewrites the case the
            // workbook is mapped from, and the parser's reading rides along.
            onEditValue={(filename, edit, value) =>
              setParserCase((current) => (current ? applyReviewEdit(current, filename, edit, value) : current))
            }
          />

          <div className="space-y-1.5" data-testid="extraction-review">
            {/* Disagreements found while linking documents to each other — they
                belong to no single document, so they are not in the review. */}
            {(() => {
              const crossDocument = reconciliationFlags.filter(
                (f) => !reviewDocuments.some((d) => d.filename === f.sourceFile),
              );
              return crossDocument.length > 0 ? (
                <ReviewSection
                  title="Disagreements between documents"
                  meta={`${crossDocument.length}`}
                  summary="Where two documents describe the same thing differently, the lower figure is scored."
                  testId="reconciliation-flags"
                >
                  <ul className="space-y-1">
                    {crossDocument.map((flag, i) => (
                      <li key={i} className="text-[11.5px] leading-5 text-[color:var(--body)]">
                        <span className="text-[color:var(--hi)]">{flag.sourceFile}:</span> {flag.note}
                      </li>
                    ))}
                  </ul>
                </ReviewSection>
              ) : null;
            })()}

            {/* What the certificate registry added to Procurement — visible and
                questionable, never a silent edit to the user's data. */}
            {certificateFill && (
              <ReviewSection
                title="Supplier certificates"
                meta={certificateFill.report.cellsFilled > 0 ? `${certificateFill.report.cellsFilled} filled` : "nothing added"}
                testId="certificate-autofill-summary"
              >
                {certificateFill.report.cellsFilled > 0 ? (
                  <>
                    <p className="text-[11.5px] leading-5 text-[color:var(--body)]">
                      Filled {certificateFill.report.cellsFilled} field
                      {certificateFill.report.cellsFilled === 1 ? "" : "s"} across{" "}
                      {certificateFill.report.rowsChanged} supplier
                      {certificateFill.report.rowsChanged === 1 ? "" : "s"} — blanks only, nothing
                      your documents stated was changed.
                    </p>
                    {/* The financial period is not known yet at upload, so
                        validity was judged against today; the levels fill once
                        the period is set. */}
                    {certificateFill.report.notValid.length > 0 && (
                      <p className="mt-1 text-[11.5px] leading-5 text-[color:var(--body)]">
                        {certificateFill.report.notValid.length} matched certificate
                        {certificateFill.report.notValid.length === 1 ? " is" : "s are"} not current
                        today, so their B-BBEE levels were left blank. Set the financial period on
                        the workbook and re-run “Fill from certificates” — a certificate that was
                        live during the measured period still counts.
                      </p>
                    )}
                    {certificateFill.report.conflicts.length > 0 && (
                      <p className="mt-1 text-[11.5px] leading-5 text-[color:var(--body)]">
                        {certificateFill.report.conflicts.length} supplier
                        {certificateFill.report.conflicts.length === 1 ? "" : "s"} on file disagree
                        with the uploaded figures — your figures were kept.
                      </p>
                    )}
                    {certificateFill.report.ambiguous.length > 0 && (
                      <p className="mt-1 text-[11.5px] leading-5 text-[color:var(--body)]">
                        {certificateFill.report.ambiguous.length} name
                        {certificateFill.report.ambiguous.length === 1 ? "" : "s"} matched more than
                        one company — left for you to pick in the workbook.
                      </p>
                    )}
                  </>
                ) : certificateFill.report.registryUnavailable ? (
                  <p className="text-[11.5px] leading-5 text-[color:var(--body)]">
                    Supplier certificates could not be checked — procurement was left exactly as read.
                  </p>
                ) : (
                  <p className="text-[11.5px] leading-5 text-[color:var(--body)]">
                    No new supplier details found in the certificates we hold.
                  </p>
                )}
              </ReviewSection>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
