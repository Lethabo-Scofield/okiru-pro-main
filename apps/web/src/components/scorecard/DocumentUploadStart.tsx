/**
 * Document-upload start for /create-scorecard — the flagship entry.
 *
 * Three acts:
 *  1. The stage — an inviting drop surface + the expected-documents checklist.
 *  2. Scanning theatre — files slide in, a shimmer sweeps while the parser
 *     reads, then each file is stamped with its classification.
 *  3. The reveal — the pillar rack lights up, stat tiles count up, and the
 *     scorecard is created from the extracted values.
 *
 * Data flow is unchanged: okiru-ai-parser (/api/parser/resolve-case-files) →
 * mapParserCaseToWorkbookSections → the SAME create → workbook import → submit
 * path manual entry and Excel import use (one canonical calculator).
 *
 * Status visuals follow the dataviz rules: state = icon + label, never color
 * alone; numbers/labels wear ink tokens, colored marks carry the state.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  FolderOpen,
  ArrowRight,
  Check,
  ChevronLeft,
  CloudUpload,
  CreditCard,
  FileText,
  Loader2,
  Minus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
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

/**
 * What a batch costs in credit tokens, and what the wallet holds.
 *
 * The server converts the quote's price into tokens and reports the balance in
 * the same call, so the number shown here and the number charged are the same
 * number — there is no client-side arithmetic to drift.
 */
interface TokenCostFile {
  filename: string;
  tokens: number;
  /** Which pricing rule the server put this document under. */
  effort: "standard" | "high" | "workbook";
  requiresOcr: boolean;
  pages: number | null;
  sheets: number | null;
  rows: number | null;
}

interface TokenCost {
  quoteId: string;
  tokens: number;
  /** Per-document itemisation — each file priced under its effort rule. */
  files?: TokenCostFile[];
  /** Tokens the batch minimum adds beyond the itemised documents. */
  minimumTopUp?: number;
  /** The effort rules themselves, served so the UI never restates them wrong. */
  effortRules?: Array<{ tier: string; label: string; rule: string }>;
  balance: number;
  balanceAfter: number;
  sufficient: boolean;
  shortfall: number;
  alreadyAuthorized: boolean;
}

const tokenText = (value: number): string => value.toLocaleString("en-ZA");

const EFFORT_LABELS: Record<string, string> = { high: "High", workbook: "Workbook", standard: "Standard" };

// The flow snapshot — how a paid extraction survives navigation. Shared with
// the Hub's "continue where you left off" strip, so it lives in its own module.
import { clearFlowSnapshot, readFlowSnapshot, writeFlowSnapshot } from "./flowSnapshot";
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

/** A file's size in whatever unit the structure scan actually established. */
function fileUnits(file: ParserQuote["files"][number]): string {
  if (file.structure.pages) return `${file.structure.pages} page${file.structure.pages === 1 ? "" : "s"}`;
  if (file.structure.sheets) return `${file.structure.sheets} sheet${file.structure.sheets === 1 ? "" : "s"}`;
  if (file.structure.rows) return `${file.structure.rows.toLocaleString()} rows`;
  return "Structure scan";
}

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

/** rAF count-up for hero numbers. */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

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

  /** Save one immutable, lossless run for every document returned by the case parser. */
  const persistParserRuns = async (data: ParserCaseLike, list: File[]): Promise<void> => {
    const caseData = data as ParserCaseLike & { case_id?: string };
    const reviewRows = data.documents_needing_review ?? [];
    const tasks = (data.documents_detected ?? []).map(async (detected: any) => {
      const file = list.find((candidate) => candidate.name === detected.filename);
      if (!file) throw new Error(`No persisted upload found for ${detected.filename}`);
      const documentId = await persistDocument(file);
      const parserOutput = detected.parser_output ?? {
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
      const reviewReasons = reviewRows.find((row) => row.filename === detected.filename)?.reasons ?? [];
      const res = await fetch(`/api/parser-documents/${encodeURIComponent(documentId)}/runs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parserOutput, caseId: caseData.case_id ?? null, reviewReasons }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Could not save parser result for ${detected.filename}`);
      }
    });
    const results = await Promise.allSettled(tasks);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      throw new Error(`${failures.length} parser result${failures.length === 1 ? "" : "s"} could not be saved to the document library.`);
    }
  };

  /**
   * Step 7: the paid work. Only runs once the quote is paid, and sends the
   * quote id so the server can verify payment and that these are the exact
   * files that were paid for.
   */
  const runExtraction = async (list: File[], quoteId: string): Promise<boolean> => {
    let delivered = false;
    setParsing(true);
    setResolving(false);
    setResolveProgress(null);
    setParseError(null);
    setDocProgress({});
    try {
      await persistSelectedDocuments(list);
      const form = new FormData();
      for (const f of list) form.append("files", f, f.name);
      form.append("case_id", `create_scorecard_${Date.now()}`);
      form.append("quote_id", quoteId);
      // Streaming endpoint: emits per-file doc-start/doc-done SSE events so the
      // list fills up as each document is read, then a single result event.
      const res = await fetch("/api/parser/resolve-case-files-stream", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (res.status === 402 || res.status === 409 || res.status === 410) {
        const body = await res.json().catch(() => ({}));
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
        const { done, value } = await reader.read();
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

      if (streamError) throw new Error(streamError);
      if (!data) throw new Error("The parser did not return a result.");
      try {
        await persistParserRuns(data, list);
        setLibraryWarning(null);
      } catch (persistenceError) {
        console.error("[DocumentUploadStart] Parser result persistence failed", persistenceError);
        setLibraryWarning(persistenceError instanceof Error ? persistenceError.message : "Parser results were not saved to the document library.");
      }
      // Merge with anything already paid for and read in an earlier round, so a
      // requote never loses (or re-charges for) documents we already have.
      const mergedCase = mergeParserCases(parserCaseRef.current, data);
      parserCaseRef.current = mergedCase;
      setParserCase(mergedCase);
      delivered = true;
      // These files are now part of the case: never priced, charged or read again.
      const nowRead = new Set(readKeysRef.current);
      for (const f of list) nowRead.add(filePersistenceKey(f));
      readKeysRef.current = nowRead;
      setReadKeys(nowRead);
      setQuote(null);
      setTokenCost(null);
      setDoneStaging(false);
      const readNames = Array.from(
        new Set([...(readFlowSnapshot(snapshotScope)?.fileNames ?? []), ...list.map((f) => f.name)]),
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
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read the documents");
    } finally {
      setParsing(false);
      setResolving(false);
    }
    return delivered;
  };

  /**
   * Ask the server to settle the paid run that just ended — the same call the
   * ESG flow makes. Whatever the run failed to deliver is refunded there,
   * decided from the parser's own record of the run, never from this screen.
   */
  const settlePaidRun = async (quoteId: string, delivered: boolean) => {
    try {
      const res = await fetch(`/api/tokens/runs/${encodeURIComponent(quoteId)}/settle-outcome`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
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
    } catch {
      // The server settles every paid run on its own sweep regardless.
    }
  };

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
   */
  const spendAndExtract = async () => {
    if (!quote) return;
    setPaying(true);
    setParseError(null);
    setRefundNotice(null);
    try {
      const res = await fetch("/api/tokens/authorize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.quoteId }),
      });
      const body = await res.json().catch(() => ({}));
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
      const delivered = await runExtraction(unreadFiles, quote.quoteId);
      await settlePaidRun(quote.quoteId, delivered);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not start processing");
    } finally {
      setPaying(false);
    }
  };

  /** Extensions the parser can read. Anything else is filtered with a warning. */
  const READABLE = new Set([
    ".pdf", ".docx", ".doc", ".xlsx", ".xlsm", ".xls", ".pptx", ".ppt",
    ".csv", ".txt", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp",
  ]);

  /**
   * Whole-folder upload.
   *
   * A folder carries everything — including desktop.ini, thumbnails and
   * whatever else lives alongside the evidence. Silently dropping those would
   * be dishonest about what we read, and refusing the whole folder over one
   * stray file would be worse. So: take what we can read, say plainly what was
   * skipped, and let the user decide.
   */
  const addFolder = (incoming: File[], origin?: UploadOrigin) => {
    const readable: File[] = [];
    const skipped: string[] = [];

    for (const file of incoming) {
      const dot = file.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
      // Hidden/system files a folder picker sweeps up.
      if (file.name.startsWith(".") || file.name === "Thumbs.db" || file.name === "desktop.ini") continue;
      if (READABLE.has(ext) && file.size > 0) readable.push(file);
      else skipped.push(file.name);
    }

    setSkippedFiles(skipped);
    if (readable.length > 0) addFiles(readable, origin);
  };

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
    // Skip OS / Office junk that is never a real document: Excel/Word lock files
    // (~$name.xlsx, created while the file is open in the app), macOS resource
    // forks (._name), and Thumbs.db / .DS_Store. These are unreadable and used to
    // fail the whole quote with "Failed to fetch".
    const isJunk = (name: string) => {
      const base = name.split(/[\\/]/).pop() ?? name;
      return /^~\$/.test(base) || /^\._/.test(base) || /^\.(ds_store)$/i.test(base) || /^thumbs\.db$/i.test(base);
    };
    const skipped = incoming.filter((f) => isJunk(f.name)).map((f) => f.name.split(/[\\/]/).pop() ?? f.name);
    const usable = incoming.filter((f) => !isJunk(f.name));
    if (skipped.length > 0) {
      setParseError(
        `Skipped ${skipped.length} temporary file${skipped.length === 1 ? "" : "s"} (${skipped.slice(0, 2).join(", ")}${skipped.length > 2 ? "…" : ""}) — these are Excel/Office lock files, not documents. Close the workbook in Excel and upload the real file.`,
      );
    }
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
  // Requires `doneStaging`: this flag collapses the stage into the checkout
  // layout, and doing that the moment a quote landed is what left people with
  // "files appear but there is nowhere to carry on".
  const quoteReady = Boolean(quote && doneStaging && unreadFiles.length > 0 && !quoting && !parsing);
  /** Whether reading the unread files spends tokens, and whether the balance covers it. */
  const readCharging = Boolean(quote && quote.paymentRequired !== false && tokenCost !== null);
  const readUnaffordable = readCharging && tokenCost !== null && !tokenCost.sufficient && !tokenCost.alreadyAuthorized;
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
    else void runExtraction(unreadFiles, quote.quoteId);
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


  return (
    <div data-testid="document-upload-start">
      {/* Scoped animation keyframes */}
      <style>{`
        @keyframes dusFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dusShimmer { from { transform: translateX(-100%); } to { transform: translateX(220%); } }
        @keyframes dusPulseRing { 0% { box-shadow: 0 0 0 0 rgba(167,139,250,0.28); } 70% { box-shadow: 0 0 0 14px rgba(167,139,250,0); } 100% { box-shadow: 0 0 0 0 rgba(167,139,250,0); } }
        @keyframes dusStamp { 0% { opacity: 0; transform: scale(0.85); } 60% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
        .dus-fade-up { animation: dusFadeUp 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .dus-stamp { animation: dusStamp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
      `}</style>

      {/* Left-aligned and at document scale. A 34px centred headline over a
          working step read like a landing page rather than a step in an
          assessment, which is what made the flow feel unserious. */}
      <div className="mb-5">
        <h3 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-white">
          {quoteReady && quote
            ? quote.paymentRequired === false
              ? "Review your documents"
              : "Review and pay"
            : parserCase
              ? "Your documents"
              : addMode
                ? `Add documents to ${existingCompany!.name}`
                : "Add your documents"}
        </h3>
        <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--body)]">
          {quoteReady && quote
            ? quote.paymentRequired === false
              ? "Processing is free. Review the documents below, then continue."
              : "Nothing is read until you pay."
            : parserCase
              ? "Read and placed below. Forgot one? Add it — only the new documents are read and charged."
              : "We identify what is present, what is missing and what needs review."}
        </p>
      </div>

      {/* A restored run announces itself. Without this, coming back to data
          you don't remember paying for looks like a glitch — and the only way
          out of a restore you don't want would be a hard refresh. */}
      {restoredAt && parserCase && (
        <div
          className="mb-4 flex flex-col gap-3 rounded-[18px] border border-emerald-400/25 bg-emerald-500/[0.06] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
          data-testid="restored-run-banner"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-200">
              <Check className="h-4 w-4 shrink-0" />
              Your processed documents were saved
            </p>
            <p className="mt-0.5 text-[12px] leading-5 text-[color:var(--body)]">
              We restored the extraction you already paid for
              {(() => {
                const at = new Date(restoredAt);
                return Number.isNaN(at.getTime())
                  ? ""
                  : ` from ${at.toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
              })()}
              . Review it below and create the scorecard — no tokens were spent again.
            </p>
          </div>
          <button
            type="button"
            onClick={discardRun}
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/[0.10] px-4 py-2 text-[12px] font-semibold text-[color:var(--body)] transition-colors hover:bg-white/[0.04]"
            data-testid="button-discard-restored-run"
          >
            Discard and start over
          </button>
        </div>
      )}

      {/* Sector selector — drives the sector-aware document checklist and the
          scorecard's calculator. B-BBEE evidence differs by sector + size. */}

      {/* ACT 1 — the stage */}
      <motion.div
        layout
        className={
          quoteReady || bareUpload || revealed ? "grid gap-5" : "grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"
        }
      >
        {!quoteReady && !bareUpload && !revealed && (
        <motion.aside layout className="rounded-[18px] border border-white/[0.07] bg-[color:var(--ink-2)] p-4 lg:order-2 lg:self-start">
          <AnimatePresence initial={false}>
          {quote && !parserCase && (
            <motion.div
              key="quoted-documents"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="mb-5 overflow-hidden border-b border-white/[0.06] pb-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[color:var(--muted)]">Documents</p>
                  <p className="mt-1 text-[13px] text-[color:var(--body)]">
                    {files.length} file{files.length === 1 ? "" : "s"} ready
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7]"
                >
                  Change
                </button>
              </div>
              <div className="mt-3 max-h-44 space-y-1 overflow-auto pr-1">
                {files.map((file) => {
                  const quotedFile = quoted(file.name);
                  return (
                    <div key={file.name} className="flex items-center gap-2 rounded-xl bg-white/[0.035] px-2.5 py-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[color:var(--muted)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium text-[#e5e5ea]">{file.name}</p>
                        <p className="mt-0.5 text-[10.5px] text-[color:var(--muted)]">
                          {quotedFile?.requiresOcr ? "Scan" : quotedFile ? "Digital" : "Waiting"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(file.name)}
                        className="rounded-full p-1 text-[color:var(--muted)] transition-colors hover:bg-white/[0.06] hover:text-[color:var(--body)]"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
          </AnimatePresence>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[color:var(--muted)]">Company profile</p>
          <div className="mt-4 space-y-5">
            {sectorOptions.length > 0 && (
              <div>
                <label className="mb-2 block text-[12px] font-medium text-[color:var(--body)]">Sector</label>
                <select
                  value={sector}
                  onChange={(e) => {
                    setSector(e.target.value);
                    setSubSector("");
                  }}
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-[color:var(--ink-3)] px-3 text-[13px] text-white outline-none focus:border-white/25 focus:ring-2 focus:ring-white/[0.05]"
                  data-testid="sector-select-side"
                >
                  <option value="">Select sector…</option>
                  {sectorOptions.map((s) => (
                    <option key={s.code} value={s.code}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}

            {activeSector?.subSectors && (
              <div>
                <label className="mb-2 block text-[12px] font-medium text-[color:var(--body)]">Sub-sector</label>
                <select
                  value={subSector}
                  onChange={(e) => setSubSector(e.target.value)}
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-[color:var(--ink-3)] px-3 text-[13px] text-white outline-none focus:border-white/25 focus:ring-2 focus:ring-white/[0.05]"
                  data-testid="subsector-select-side"
                >
                  <option value="">Select</option>
                  {activeSector.subSectors.map((ss) => (
                    <option key={ss.value} value={ss.value}>{ss.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <p className="mb-2 text-[12px] font-medium text-[color:var(--body)]">Organisation size</p>
              <div className="space-y-1.5">
                {sizeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSize(option.value)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.04]"
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
            </div>
          </div>
        </motion.aside>
        )}

        <motion.section layout className="min-w-0 lg:order-1">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.txt,.csv,.doc,.docx,.xlsx,.xlsm,.xls,.pptx,.png,.jpg,.jpeg"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(Array.from(e.target.files));
              e.currentTarget.value = "";
            }}
            data-testid="docs-file-input"
          />
          {/* Whole-folder upload. Clients keep their evidence in a folder, not
              as a hand-picked list, and making them select 26 files one by one
              is how documents get left out. Unsupported files are filtered with
              a warning rather than failing the whole drop. */}
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
      <AnimatePresence mode="wait" initial={false}>
      {quoteReady && quote && (
        (() => {
          const totalPages = quote.files.reduce((sum, file) => sum + (file.structure.pages ?? 0), 0);
          const spreadsheetCount = quote.files.filter((file) => (file.structure.sheets ?? 0) > 0).length;
          // The server decides whether tokens are involved. With the gate off
          // this is a review step, not a spend — never show a cost we won't take.
          const charging = quote.paymentRequired !== false && tokenCost !== null;
          const cannotAfford = charging && tokenCost !== null && !tokenCost.sufficient && !tokenCost.alreadyAuthorized;
          const expiry = new Date(quote.expiresAt);
          const expiryLabel = Number.isNaN(expiry.getTime())
            ? "Today"
            : expiry.toLocaleString("en-ZA", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
          return (
            <motion.div
              key="processing-quote"
              layout
              initial={{ opacity: 0, x: 28, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -24, scale: 0.985 }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              className="mb-4 rounded-[22px] border border-white/[0.08] bg-[color:var(--ink-2)] p-5"
              data-testid="payment-summary"
            >
              {/* Reviewing the cost is not a one-way door either. Without this,
                  the only route back to the uploader was removing a document. */}
              <button
                type="button"
                onClick={() => setDoneStaging(false)}
                className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--body)] transition-colors hover:text-white"
                data-testid="button-add-more-documents"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Add more documents
              </button>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {charging ? "This batch costs" : "Ready to process"}
                  </p>
                  <h4
                    className="mt-2 text-[30px] font-semibold leading-none text-white"
                  >
                    {charging && tokenCost
                      ? `${tokenText(tokenCost.tokens)} tokens`
                      : `${quote.files.length} document${quote.files.length === 1 ? "" : "s"}`}
                  </h4>
                  <p className="mt-2 max-w-sm text-[13px] leading-5 text-[color:var(--body)]">
                    {charging
                      ? "Longer documents and scans cost more to read. Nothing is spent until you start."
                      : "Check what we picked up before we extract and map your documents."}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-[color:var(--ink-3)] px-4 py-3 text-right">
                  {charging && tokenCost ? (
                    <>
                      <p className="text-[11px] text-[color:var(--muted)]">Balance after</p>
                      <p
                        className={`mt-1 text-[13px] font-medium tabular-nums ${
                          tokenCost.sufficient ? "text-[color:var(--body)]" : "text-red-300"
                        }`}
                        data-testid="balance-after"
                      >
                        {tokenText(Math.max(0, tokenCost.balanceAfter))}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-[color:var(--muted)]">
                        of {tokenText(tokenCost.balance)} now
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] text-[color:var(--muted)]">Expires</p>
                      <p className="mt-1 text-[13px] font-medium text-[color:var(--body)]">{expiryLabel}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                  <p className="text-[11px] text-[color:var(--muted)]">Documents</p>
                  <p className="mt-1 text-[20px] font-semibold text-white">{quote.files.length}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                  <p className="text-[11px] text-[color:var(--muted)]">Pages</p>
                  <p className="mt-1 text-[20px] font-semibold text-white">{totalPages || "Auto"}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                  <p className="text-[11px] text-[color:var(--muted)]">Workbooks</p>
                  <p className="mt-1 text-[20px] font-semibold text-white">{spreadsheetCount}</p>
                </div>
              </div>

              {/* One "tokens" in this UI, and it is the credit kind. The
                  model's own token estimate is an internal cost input — showing
                  it beside a credit cost invited people to read one as the
                  other. Each document shows the credit tokens IT costs, under
                  the effort rule that priced it, so the total is explained
                  line by line rather than asserted. */}
              <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07]">
                <div className="grid grid-cols-[minmax(0,1.6fr)_110px_140px] gap-3 border-b border-white/[0.06] bg-white/[0.035] px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--muted)] max-md:hidden">
                  <span>Document</span>
                  <span>Effort</span>
                  <span className="text-right">{charging ? "Tokens" : "Size"}</span>
                </div>
                {quote.files.map((file) => {
                  const units = fileUnits(file);
                  const priced = tokenCost?.files?.find((f) => f.filename === file.filename);
                  const effort = priced ? EFFORT_LABELS[priced.effort] ?? "Standard" : file.requiresOcr ? "High" : "Standard";
                  return (
                    <div
                      key={file.filename}
                      className="grid gap-2 border-b border-white/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.6fr)_110px_140px] md:items-center md:gap-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-[#f2f2f7]">{file.filename}</p>
                        <p className="mt-0.5 text-[11px] text-[color:var(--muted)]">
                          <span className="md:hidden">{effort} effort · </span>
                          {units}
                          {charging && priced ? (
                            <span className="md:hidden"> · {tokenText(priced.tokens)} tokens</span>
                          ) : null}
                        </p>
                      </div>
                      <span className="hidden text-[12px] text-[color:var(--body)] md:block">{effort}</span>
                      <span className="hidden text-[12px] tabular-nums text-[color:var(--body)] md:block md:text-right">
                        {charging && priced ? `${tokenText(priced.tokens)} tokens` : units}
                      </span>
                    </div>
                  );
                })}
                {charging && (tokenCost?.minimumTopUp ?? 0) > 0 && (
                  <div
                    className="grid gap-2 border-b border-white/[0.05] px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_110px_140px] md:items-center md:gap-3"
                    data-testid="quote-minimum-charge"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[color:var(--body)]">Small-batch minimum</p>
                      <p className="mt-0.5 text-[11px] text-[color:var(--muted)]">
                        Batches this small are topped up to the minimum processing charge.
                      </p>
                    </div>
                    <span className="hidden md:block" />
                    <span className="text-[12px] tabular-nums text-[color:var(--body)] md:text-right">
                      {tokenText(tokenCost!.minimumTopUp!)} tokens
                    </span>
                  </div>
                )}
                <div className="grid gap-2 border-t border-white/[0.12] bg-white/[0.045] px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_110px_140px] md:items-center md:gap-3">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[color:var(--body)]">
                    {charging ? "Total" : "This batch"}
                  </span>
                  <span className="hidden md:block" />
                  <span className="text-[14px] font-bold text-white md:text-right" data-testid="quote-total-cost">
                    {charging && tokenCost
                      ? `${tokenText(tokenCost.tokens)} tokens`
                      : `${quote.files.length} document${quote.files.length === 1 ? "" : "s"}`}
                  </span>
                </div>
              </div>

              {/* The rules the prices above came from — served by the same
                  endpoint that priced them, so the explanation cannot drift
                  from the charge. */}
              {charging && (tokenCost?.effortRules?.length ?? 0) > 0 && (
                <div className="mt-3 rounded-2xl border border-white/[0.06] bg-[color:var(--ink-2)] p-4" data-testid="effort-rules">
                  <p className="text-[12px] font-semibold text-white">How effort sets the token cost</p>
                  <div className="mt-2 space-y-1.5">
                    {tokenCost!.effortRules!.map((rule) => (
                      <p key={rule.tier} className="text-[11.5px] leading-5 text-[color:var(--body)]">
                        <span className="font-semibold text-[color:var(--body)]">{rule.label}</span> — {rule.rule}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {!charging && (
                <p className="mt-3 text-[11px] text-[color:var(--muted)]">
                  Processing is not being charged for this run.
                </p>
              )}

              {cannotAfford && tokenCost && (
                <div
                  className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/[0.06] p-4"
                  data-testid="insufficient-tokens"
                >
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-red-200">
                    <AlertTriangle className="h-4 w-4" />
                    {tokenText(tokenCost.shortfall)} tokens short
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-[color:var(--body)]">
                    This batch needs {tokenText(tokenCost.tokens)} tokens and you have{" "}
                    {tokenText(tokenCost.balance)}. Top up, or remove some documents and process the rest first.
                  </p>
                  <a
                    href="/settings/billing"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7]"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Add tokens
                  </a>
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[color:var(--ink-2)] p-4">
                <p className="text-[13px] font-semibold text-white">Included</p>
                <div className="mt-3 grid gap-2 text-[12px] text-[color:var(--body)] sm:grid-cols-2">
                  <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[color:var(--body)]" /> Document reading</span>
                  <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[color:var(--body)]" /> Field extraction</span>
                  <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[color:var(--body)]" /> Scorecard mapping</span>
                  <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[color:var(--body)]" /> Review flags where needed</span>
                </div>
              </div>

              {charging && quote.totals.isUpperBound && (
                <p className="mt-3 text-[11px] text-[color:var(--muted)]">
                  Scanned documents are estimated conservatively. You will not be charged more than this.
                </p>
              )}

              <div className="mt-5 space-y-2">
                <button
                  onClick={() => void (charging ? spendAndExtract() : runExtraction(unreadFiles, quote.quoteId))}
                  disabled={paying || parsing || cannotAfford}
                  className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-[15px] font-semibold transition-colors disabled:opacity-50"
                  style={{ background: "#0e6fff", color: "#ffffff" }}
                  data-testid={charging ? "button-spend-tokens" : "button-process"}
                >
                  {paying || parsing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-[18px] w-[18px]" />
                  )}
                  {charging && tokenCost
                    ? tokenCost.alreadyAuthorized
                      ? "Read my documents"
                      : `Read my documents — ${tokenText(tokenCost.tokens)} tokens`
                    : "Read my documents"}
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-white/[0.10] px-5 text-[13.5px] font-semibold text-[color:var(--body)] transition-colors hover:bg-white/[0.04]"
                >
                  Change documents
                </button>
              </div>
            </motion.div>
          );
        })()
      )}
      {!quoteReady && !revealed && (!quote || parserCase || quoting) && (
      <motion.div
        key={quoting ? "pricing-documents" : parserCase ? "parsed-upload" : "upload-documents"}
        layout
        initial={{ opacity: 0, x: -22, scale: 0.985 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 24, scale: 0.985 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-[20px] text-center cursor-pointer transition-all duration-300 overflow-hidden"
        style={{
          background: dragActive
            ? "#111827"
            : "#0e0e10",
          border: `1px dashed ${dragActive ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)"}`,
          padding: files.length > 0 ? "16px 18px" : "28px 20px 26px",
          transform: dragActive ? "scale(1.008)" : "scale(1)",
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
        }}
        data-testid="docs-drop-zone"
      >
        {files.length === 0 ? (
          <>
            <div
              className="w-11 h-11 rounded-2xl mx-auto mb-3 flex items-center justify-center transition-transform duration-300"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                transform: dragActive ? "scale(1.1)" : "scale(1)",
              }}
            >
              <CloudUpload className="w-5 h-5 text-[color:var(--body)]" />
            </div>
            {/* No heading here. The step above already says "Add your
                documents"; repeating it, then labelling the button with the
                same words a third time, is what made choosing "upload" and
                then being asked to upload feel like being asked twice. */}
            <p className="text-[13px] text-[color:var(--body)] mb-4 max-w-sm mx-auto leading-5">
              Certificates, affidavits, spend schedules, payroll and EE reports.
              PDF, Word, Excel or scans.
            </p>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7] focus:outline-none focus:ring-4 focus:ring-white/[0.08]"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              data-testid="button-upload-documents"
            >
              <Upload className="h-4 w-4" />
              Upload documents
            </button>
            <button
              type="button"
              className="ml-2 inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.12] px-5 py-2.5 text-[14px] font-semibold text-[color:var(--body)] transition-colors hover:bg-white/[0.06]"
              onClick={(e) => {
                e.stopPropagation();
                folderInputRef.current?.click();
              }}
              data-testid="button-upload-folder"
            >
              <FolderOpen className="h-4 w-4" />
              Upload a folder
            </button>
            <p className="mt-3 text-[11px] text-[#86868b]">
              Token cost shown before anything is read.
            </p>
            <div className="hidden">
              {["PDF", "DOCX", "XLSX", "CSV", "SCANS"].map((ext) => (
                <span key={ext} className="px-2 py-0.5 rounded text-[10px] tracking-wide text-[color:var(--muted)]" style={{ background: "var(--ink-3)" }}>
                  {ext}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-[color:var(--body)] hover:text-violet-300 transition-colors">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[13px] font-medium" data-testid="add-more-documents-label">
              {parserCase
                ? "Add a document you forgot — only new ones are read and charged"
                : "Add more documents"}
            </span>
          </div>
        )}
      </motion.div>
      )}
      </AnimatePresence>

      {/* Folder upload skipped some files. A warning, not an error: the upload
          still went ahead with everything readable, and the user decides
          whether the skipped ones mattered. */}
      {skippedFiles.length > 0 && (
        <div
          className="mt-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4"
          data-testid="skipped-files-warning"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            {skippedFiles.length} file{skippedFiles.length === 1 ? "" : "s"} in that folder could not be read
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--body)]">
            We only read PDFs, Word, Excel, PowerPoint, CSV and images. Everything else was left out —
            if one of these was evidence, convert it and add it.
          </p>
          <p className="mt-2 truncate font-mono text-[11px] text-[color:var(--body)]">
            {skippedFiles.slice(0, 6).join(", ")}
            {skippedFiles.length > 6 ? ` +${skippedFiles.length - 6} more` : ""}
          </p>
        </div>
      )}

      {/* The way ON from staging — kept at the TOP, directly under the drop
          zone. It used to sit below the pillar batches, which on any real
          screen put the one button that advances the flow beneath a long grid:
          you staged files and then had to go hunting for how to continue.
          Whether the documents arrived through the main button or a pillar
          batch is irrelevant here: both stage into the same list, so both end
          at the same control. */}
      {!doneStaging && unreadFiles.length > 0 && !parsing && (() => {
        const n = unreadFiles.length;
        const docs = `${n} ${parserCase ? "new " : ""}document${n === 1 ? "" : "s"}`;
        const priceLine = quoting
          ? "Working out the cost — nothing is read yet."
          : !quote
            ? "We could not work out the cost of these documents. Nothing has been read or charged."
            : readCharging && tokenCost
              ? `${tokenText(tokenCost.tokens)} tokens · you have ${tokenText(tokenCost.balance)}.`
              : quote.paymentRequired === false
                ? "Reading is free for this run."
                : "Checking your balance…";
        return (
          <div
            className="mt-3 flex flex-col gap-3 rounded-[18px] border border-white/[0.08] bg-[color:var(--ink-3)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            data-testid="read-bar"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white">{docs} ready to read</p>
              <p className="mt-0.5 text-[12px] leading-5 text-[color:var(--body)]" data-testid="read-bar-price">
                {priceLine}{" "}
                {parserCase
                  ? "Documents already read are not charged again."
                  : "Keep adding if you have more — nothing is read until you press read."}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {!quoting && !quote && (
                <button
                  type="button"
                  onClick={() => void prepareAndQuote(files)}
                  className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-medium text-[color:var(--body)] transition-colors hover:text-white"
                  data-testid="button-retry-quote-inline"
                >
                  Try again
                </button>
              )}
              <button
                type="button"
                disabled={quoting}
                onClick={() => setDoneStaging(true)}
                className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-medium text-[color:var(--body)] transition-colors hover:text-white disabled:opacity-50"
                data-testid="button-done-staging"
              >
                See cost breakdown
              </button>
              {readUnaffordable && tokenCost ? (
                <a
                  href="/settings/billing"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7]"
                  data-testid="button-add-tokens"
                >
                  <CreditCard className="h-4 w-4" />
                  Add tokens — {tokenText(tokenCost.shortfall)} short
                </a>
              ) : (
                <button
                  type="button"
                  disabled={!quote || quoting || paying}
                  onClick={readNow}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7] disabled:opacity-50"
                  data-testid="button-read-now"
                >
                  {quoting || paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {readCharging && tokenCost && !tokenCost.alreadyAuthorized
                    ? `Read ${n === 1 ? "it" : `all ${n}`} — ${tokenText(tokenCost.tokens)} tokens`
                    : `Read ${n === 1 ? "it" : `all ${n}`}`}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* The dead end. "Done adding" hides the staging bar above, and the review
          panel below only renders once a quote exists — so when pricing failed
          the button appeared to do nothing at all: the way ON vanished and
          nothing replaced it. The only escape was adding or removing a file
          (which resets doneStaging), and the only clue was a red line far below
          the fold. Say what went wrong where the button was, and offer both
          ways forward. */}
      {doneStaging && !quote && !quoting && unreadFiles.length > 0 && (
        <div
          className="mt-3 flex flex-col gap-3 rounded-[18px] border border-amber-300/20 bg-[#1d1a14] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
          data-testid="quote-unavailable"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-amber-100">
              We could not work out the cost of these {files.length} document{files.length === 1 ? "" : "s"}
            </p>
            <p className="mt-0.5 text-[12px] leading-5 text-[#a1a1aa]">
              {parseError ?? "Pricing did not finish, so there is nothing to review yet."} Nothing has
              been read and nothing has been charged.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setDoneStaging(false)}
              className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-medium text-[color:var(--body)] transition-colors hover:text-white"
              data-testid="button-back-to-staging"
            >
              Back to adding
            </button>
            <button
              type="button"
              onClick={() => void prepareAndQuote(files)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7]"
              data-testid="button-retry-quote"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* The upload surface itself, one batch per pillar plus the whole-file
          uploads. Shown before processing so the user can go and fetch what is
          missing rather than spending tokens to be told their score is low.
          Once documents have been read it doubles as a coverage ledger.

          Gated on `parserCase`, NOT on `quote`. A quote arrives the moment the
          first pillar's files land, and gating on it tore the uploader off the
          screen mid-task: you could fill Ownership and then had nowhere to put
          Skills. A quote is just a price for what is staged so far — it is
          re-issued whenever the list changes, so it is not a commitment and must
          not behave like one. Extraction is the point of no return, so that is
          what closes the uploader. */}
      {!parserCase && !bareUpload && (
        <div className="mt-3">
          <PillarDocumentBatches
            satisfiedDocumentIds={satisfiedDocumentIds}
            filedBatchByFile={filedBatchByFile}
            stagedFileNames={files.map((f) => f.name)}
            onPick={handleBatchPick}
            disabled={parsing}
          />
        </div>
      )}

      {/* Double-check before anything is staged. */}
      <ConfirmUploadDialog
        pending={pendingUpload}
        onConfirm={confirmPendingUpload}
        onCancel={() => setPendingUpload(null)}
      />

      {/* Expected documents — sector-aware checklist (below the stage) */}

      {/* Phase banner — names where we are (Reading → Reconciling → Scoring) so
          the multi-minute paid wait shows movement, not a frozen spinner. */}
      {parsing && (
        <div ref={extractionPhaseRef} className="mt-3 flex items-center gap-3 rounded-xl border border-violet-300/20 bg-[#17151d] px-4 py-3" data-testid="extraction-phase">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-300" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-violet-100">
              {resolving ? "Reconciling into your company profile" : "Reading your documents"}
            </div>
            <div className="text-[12px] text-[color:var(--body)]">
              {resolving
                ? resolveProgress
                  ? `Understanding document ${Math.min(resolveProgress.done + 1, resolveProgress.total)} of ${resolveProgress.total} — cross-checking names, IDs and figures across every file`
                  : "Cross-checking names, IDs and figures across every file"
                : `${Object.values(docProgress).filter((s) => s === "done").length} of ${unreadFiles.length} read`}
            </div>
          </div>
          {resolving && resolveProgress && resolveProgress.total > 0 && (
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10 shrink-0">
              <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${Math.round((resolveProgress.done / resolveProgress.total) * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {/* ACT 2 — scanning theatre */}
      {(revealed ? unreadFiles.length > 0 : files.length > 0) && !quoteReady && (!quote || parserCase || quoting) && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-[color:var(--ink-2)]">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_110px_120px_36px] gap-3 border-b border-white/[0.06] px-3.5 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--muted)] sm:grid">
            <span>File</span>
            <span>Status</span>
            <span>Type</span>
            <span />
          </div>
          {(revealed ? unreadFiles : files).map((f, i) => {
            const detected = (parserCase?.documents_detected ?? []).find((d) => d.filename === f.name);
            const missing = parsing ? { fields: [], notes: [] } : docMissingContent(f.name);
            const hasGaps = missing.fields.length > 0 || missing.notes.length > 0;
            const quotedFile = quoted(f.name);
            const fileType = quotedFile?.requiresOcr ? "Scan" : quotedFile ? "Digital" : f.name.split(".").pop()?.toUpperCase() ?? "File";
            // Per-file progress from the streaming parser: this file's own state,
            // not a single spinner across the whole batch.
            const perFile = docProgress[f.name];
            const isReadingThis = perFile === "parsing";
            const alreadyRead = !isUnread(f);
            // A round reads only the new files; the ones already read keep their verdict.
            const statusLabel = parsing && !alreadyRead
              ? perFile === "done"
                ? "Read"
                : perFile === "error"
                  ? "Error"
                  : isReadingThis
                    ? "Reading"
                    : resolving
                      ? "Read"
                      : "Queued"
              : detected
                ? detected.status === "passed" && !hasGaps
                  ? "Ready"
                  : detected.status === "review_required" || hasGaps
                    ? "Review"
                    : "Failed"
                : quotedFile
                  ? "Not read yet"
                  : quoting
                    ? "Pricing"
                    : "Queued";
            return (
              <div
                key={f.name}
                className="dus-fade-up relative overflow-hidden border-b border-white/[0.05] px-3.5 py-3 last:border-b-0"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_110px_120px_36px] sm:items-center sm:gap-3">
                  {/* shimmer sweep while THIS file is being read */}
                  {isReadingThis && (
                    <div className="absolute inset-y-0 left-0 w-1/3 pointer-events-none" style={{
                      background: "linear-gradient(100deg, transparent, rgba(167,139,250,0.09), transparent)",
                      animation: "dusShimmer 1.4s ease-in-out infinite",
                    }} />
                  )}
                  <div className="flex min-w-0 items-center gap-2 text-left">
                    <FileText className="w-4 h-4 text-[color:var(--muted)] shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-[#e5e5ea]">{f.name}</div>
                      {/* Where the user filed it, and how big it is. The pillar
                          it eventually SCORES against is the classifier's call
                          and shows in the Type column once we have read it. */}
                      {(quotedFile || filedBatchByFile[f.name]) && (
                        <div className="mt-0.5 truncate text-[11px] text-[color:var(--muted)]">
                          {filedBatchByFile[f.name] ? batchLabel(filedBatchByFile[f.name]) : null}
                          {filedBatchByFile[f.name] && quotedFile ? " · " : null}
                          {quotedFile ? fileUnits(quotedFile) : null}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/[0.04] px-2 py-1 text-[11px] text-[color:var(--body)]">
                    {isReadingThis && <Loader2 className="h-3 w-3 animate-spin" />}
                    {perFile === "done" && parsing && <Check className="h-3 w-3 text-emerald-400" />}
                    {statusLabel}
                  </span>
                  <span className="text-[12px] text-[color:var(--body)]">{fileType}</span>
                  <FileText className="hidden w-4 h-4 text-[color:var(--muted)] shrink-0" />
                  <div className="hidden flex-1 min-w-0 text-left">
                    <div className="text-[13px] text-[#e5e5ea] truncate font-medium">{f.name}</div>
                    <div className="text-[11px] mt-0.5">
                      {parsing ? (
                        <span className="text-[color:var(--muted)] inline-flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Reading document…
                        </span>
                      ) : detected ? (
                        <span className="dus-stamp inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${detected.status === "passed" ? "bg-emerald-400" : detected.status === "review_required" ? "bg-amber-400" : "bg-red-400"}`} />
                          <span className="text-[color:var(--body)]">{detected.document_type}</span>
                          {detected.status === "passed" && !hasGaps && (
                            <span className="text-emerald-400/70">· all read</span>
                          )}
                        </span>
                      ) : quoted(f.name) ? (
                        // Priced, not read. Say only what we actually know from
                        // the structure scan — never claim a verdict yet.
                        <span className="inline-flex items-center gap-1.5 text-[color:var(--muted)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[rgba(255,255,255,0.12)]" />
                          {quoted(f.name)!.requiresOcr ? "Scan — needs OCR" : "Digital"}
                          <span className="text-[color:var(--muted)]">·</span>
                          <span className="font-mono">{quoted(f.name)!.tokens.input.toLocaleString()} tok</span>
                          <span className="text-[color:var(--muted)]">· not read yet</span>
                        </span>
                      ) : quoting ? (
                        <span className="text-[color:var(--muted)]">Sizing…</span>
                      ) : (
                        <span className="text-[color:var(--muted)]">Queued</span>
                      )}
                    </div>
                  </div>
                  {/* A read document is part of the scorecard now — no remove. */}
                  {alreadyRead ? (
                    <span />
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                      className="justify-self-start p-1 text-[color:var(--muted)] transition-colors hover:text-[color:var(--body)] sm:justify-self-end"
                      data-testid={`remove-${f.name}`}
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Gaps WITHIN this document — one compact line, no per-row
                    reassurance (that's said once below), no internal jargon. */}
                {hasGaps && (
                  <div
                    className="mt-1 ml-6 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200/70"
                    data-testid={`missing-content-${f.name}`}
                  >
                    <AlertTriangle className="w-3 h-3 text-amber-400/80 shrink-0 mt-0.5" />
                    <span>
                      {missing.fields.length > 0 && (
                        <>Not read: {missing.fields.slice(0, 4).join(", ")}
                          {missing.fields.length > 4 ? ` +${missing.fields.length - 4}` : ""}</>
                      )}
                      {missing.fields.length > 0 && missing.notes.length > 0 && " · "}
                      {missing.notes.length > 0 && <>{missing.notes.slice(0, 1).join("; ")}</>}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {!parsing && files.some((f) => { const m = docMissingContent(f.name); return m.fields.length > 0 || m.notes.length > 0; }) && (
            <div className="px-3.5 py-2.5 text-[11px] text-[color:var(--body)] flex items-center gap-1.5 border-t border-white/[0.05]">
              <AlertTriangle className="w-3 h-3 text-amber-400/70 shrink-0" />
              Anything not read, you can fill in on the workbook after — it won&apos;t block you from continuing.
            </div>
          )}
        </div>
      )}

      {parseError && <p className="text-[12px] text-red-400 mt-3">{parseError}</p>}
      {libraryWarning && <p className="text-[12px] text-amber-300 mt-3">{libraryWarning}</p>}

      {/* Pricing the documents — free, structure-only, nothing read yet. */}
      {quoting && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[color:var(--body)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-300" />
          Checking size and format to price these documents — nothing is read yet.
        </div>
      )}

      {/* A paid run that delivered less than it cost — the server says what came back. */}
      {refundNotice && (
        <p className="mt-3 text-[12px] leading-5 text-emerald-200/90" data-testid="bbbee-refund-notice">
          {refundNotice}
        </p>
      )}

      {revealed && mapped && (
        <div className="mt-4">
          {/* Pillar rack — status tiles light up */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3" data-testid="coverage-preview">
            {PILLAR_TILES.map((tile, i) => {
              const c = coverageByPillar[tile.pillar];
              const status = c?.status ?? "no-document";
              const lit = status === "mapped";
              const partial = status === "needs-detail";
              return (
                <div
                  key={tile.pillar}
                  className="dus-fade-up rounded-lg px-2 py-2 text-center transition-all duration-500"
                  style={{
                    animationDelay: `${120 + i * 90}ms`,
                    background: lit ? "rgba(48,209,88,0.07)" : partial ? "rgba(255,214,10,0.05)" : "#111113",
                    border: `1px solid ${lit ? "rgba(48,209,88,0.35)" : partial ? "rgba(255,214,10,0.25)" : "#1f1f21"}`,
                  }}
                  title={c ? `${tile.pillar}: ${c.detail}${c.extractedValue ? ` (extracted: ${c.extractedValue})` : ""}` : tile.pillar}
                >
                  <div className="flex items-center justify-center mb-1">
                    {lit ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : partial ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 text-[color:var(--muted)]" />
                    )}
                  </div>
                  <div className={`text-[10px] font-medium leading-tight ${lit ? "text-emerald-200/90" : partial ? "text-amber-200/80" : "text-[color:var(--muted)]"}`}>
                    {tile.short}
                  </div>
                </div>
              );
            })}
          </div>


          {/* ── THE ONE THING THAT NEEDS A DECISION ────────────────────────
              Figures the documents disagree on stay ABOVE the Build button and
              are never collapsed. A withheld entity-level figure leaves a hole
              in the score, and the person who can close it is standing here
              with the documents open — inside an accordion it gets found after
              the scorecard looks wrong, not before. Everything else is detail
              and lives below the button. */}
          {(injected?.metaConflicts.length ?? 0) > 0 && (
            <div
              className="dus-fade-up mb-4 rounded-xl px-4 py-3 text-left"
              style={{ background: "rgba(255,214,10,0.05)", border: "1px solid rgba(255,214,10,0.22)" }}
              data-testid="meta-conflicts"
            >
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-amber-200/90">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {injected!.metaConflicts.length} figure
                {injected!.metaConflicts.length === 1 ? "" : "s"} your documents disagree on
              </p>
              <p className="mt-1 text-[11.5px] text-[color:var(--body)]">
                Left blank rather than guessed — pick the right one in the workbook and the score
                follows.
              </p>
              {/* One candidate per line. Joining them into `a (src) vs b (src)`
                  produced a wrapping run of text at exactly the moment the user
                  had to compare two numbers. */}
              <div className="mt-2 space-y-2">
                {injected!.metaConflicts.map((c) => (
                  <div
                    key={`${c.section}.${c.column}`}
                    className="rounded-lg border border-white/[0.06] bg-[color:var(--ink)]/20 px-3 py-2"
                  >
                    <p className="text-[11.5px] font-medium text-[color:var(--body)]">{c.column}</p>
                    <ul className="mt-1 space-y-0.5">
                      {c.candidates.map((cand, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] leading-5">
                          <span className="tabular-nums text-white">{String(cand.value)}</span>
                          <span className="text-[11px] text-[color:var(--muted)]">
                            {cand.sources.join(", ") || "unknown source"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What the certificate registry added to Procurement.
              Shown before Create so the registry's contribution is visible and
              questionable, never a silent edit to the user's data. */}
          {certificateFillRunning && (
            <div
              className="dus-fade-up mb-4 rounded-lg px-3 py-2.5 text-left"
              style={{ background: "#111113", border: "1px solid #1f1f21", animationDelay: "660ms" }}
              data-testid="certificate-autofill-running"
            >
              <p className="text-[11px] text-[color:var(--body)] flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking suppliers against the certificate database…
              </p>
            </div>
          )}

          {/* BUILD — one compact bar, above the review. Everything the scorecard
              needs to be built sits in a single row: the company, the rules it
              is scored under and the year it is measured over. The side panel
              that held sector and size is gone once the documents are read, so
              they are editable here. Missing documents or missing content never
              block building: the workbook scores on what we have. */}
          <div
            className="dus-fade-up rounded-2xl border border-white/[0.08] bg-[color:var(--ink-2)] p-3"
            style={{ animationDelay: "300ms" }}
            data-testid="build-bar"
          >
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] lg:items-end">
              <label className="min-w-0">
                <span className="mb-1 block text-[11px] font-medium text-[color:var(--muted)]">Company</span>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  readOnly={addMode}
                  placeholder="e.g. Acme Holdings (Pty) Ltd"
                  className="h-10 w-full rounded-xl border border-[color:var(--rule)] bg-[color:var(--ink-3)] px-3 text-[13.5px] text-white placeholder-[rgba(255,255,255,0.32)] outline-none transition-colors focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10 read-only:text-[color:var(--body)]"
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
                onClick={() => void handleCreate()}
                disabled={!canCreate}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-[13.5px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2 lg:col-span-1"
                style={{
                  background: canCreate ? "linear-gradient(135deg, #ffffff, #e7e2ff)" : "var(--ink-3)",
                  color: canCreate ? "#000" : "var(--muted)",
                  boxShadow: canCreate ? "0 0 24px rgba(167,139,250,0.15)" : "none",
                }}
                data-testid="button-create-from-documents"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {addMode
                      ? totalMappedRows > 0
                        ? `Add ${totalMappedRows} value${totalMappedRows !== 1 ? "s" : ""} to the workbook`
                        : "Add these documents to the workbook"
                      : totalMappedRows > 0
                        ? `Build scorecard · ${totalMappedRows} value${totalMappedRows !== 1 ? "s" : ""}`
                        : "Continue to workbook"}
                  </>
                )}
              </button>
            </div>

            {/* Only what stops the build, or what changes how it is scored —
                said once, under the bar. The happy path shows nothing here. */}
            {(!sector || !size || activeSector?.provisional || unreadFiles.length > 0 || !yearEndValid || workbookMismatches.length > 0) && (
              <div className="mt-2.5 space-y-1 border-t border-white/[0.05] pt-2.5 text-[11.5px] leading-5">
                {/* The workbook states a different sector or year end from the
                    one chosen here. The choice here stands; this only makes
                    sure it is a choice, not an oversight. */}
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
                {/* A sector whose ladder was applied by analogy rather than
                    transcribed says so next to the button that builds the
                    scorecard — not in a footnote. A level nobody flagged is a
                    level someone will certify. */}
                {activeSector?.provisional && (
                  <p className="flex items-start gap-1.5 text-amber-200/80" data-testid="sector-provisional-note">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span>{activeSector.provisionalNote}</span>
                  </p>
                )}
              </div>
            )}
            {addMode && (
              <p className="mt-2 text-[11px] leading-5 text-[color:var(--muted)]">
                Blanks in the workbook take these values. Nothing already there is overwritten — where a document
                disagrees, you’ll see both and we keep yours.
              </p>
            )}
          </div>

          {/* THE REVIEW — the main content after a read: each document beside
              what we took from it, worst first, at a fixed height. It replaced
              a stack of collapsed sections ("What we read", "Documents still
              worth adding", "Evidence that didn't reconcile"…) that said the
              same things detached from the documents they were about.
              Optional: the Build bar above never waits for it. */}
          <DocumentReview
            documents={reviewDocuments}
            fileFor={(name) => files.find((f) => f.name === name) ?? null}
            documentIdFor={(name) => documentIdsByName()[name] ?? null}
            onAddDocuments={() => inputRef.current?.click()}
            stillToAdd={missingDocGroups.detectable.map((g) => g.label)}
            needsDetail={needsDetailPillars.map(
              (c) => `${c.pillar}: we read ${c.extractedValue}, but it needs per-person rows to score.`,
            )}
            // A correction here is what gets built: it rewrites the case the
            // workbook is mapped from, and the parser's reading rides along.
            onEditValue={(filename, edit, value) =>
              setParserCase((current) => (current ? applyReviewEdit(current, filename, edit, value) : current))
            }
          />

          <div className="mt-4 space-y-1.5" data-testid="extraction-review">
            {/* Disagreements found while linking documents to each other — they
                belong to no single document, so they are not in the review. */}
            {(() => {
              const crossDocument = reconciliationFlags.filter(
                (f) => !reviewDocuments.some((d) => d.filename === f.sourceFile),
              );
              return crossDocument.length > 0 ? (
                <ReviewSection
                  title="Figures your documents disagree on"
                  meta={`${crossDocument.length}`}
                  tone="check"
                  icon={<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                  summary="Where two documents describe the same thing differently, the lower figure is scored."
                  testId="reconciliation-flags"
                >
                  <ul className="space-y-1">
                    {crossDocument.map((flag, i) => (
                      <li key={i} className="text-[11.5px] leading-5 text-[color:var(--body)]">
                        <span className="text-amber-300/80">{flag.sourceFile}:</span> {flag.note}
                      </li>
                    ))}
                  </ul>
                </ReviewSection>
              ) : null;
            })()}

            {certificateFill && (
              <ReviewSection
                title="Certificate database"
                meta={
                  certificateFill.report.cellsFilled > 0
                    ? `${certificateFill.report.cellsFilled} filled`
                    : "nothing added"
                }
                tone={certificateFill.report.cellsFilled > 0 ? "good" : "neutral"}
                icon={<Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                testId="certificate-autofill-summary"
              >
                {certificateFill.report.cellsFilled > 0 ? (
                  <>
                    <p className="text-[11.5px] leading-5 text-emerald-200/90">
                      Filled {certificateFill.report.cellsFilled} field
                      {certificateFill.report.cellsFilled === 1 ? "" : "s"} across{" "}
                      {certificateFill.report.rowsChanged} supplier
                      {certificateFill.report.rowsChanged === 1 ? "" : "s"} — blanks only, nothing
                      your documents stated was changed.
                    </p>
                    {/* The financial period is not known yet at upload — it is
                        entered on the workbook — so validity was judged against
                        today. Most certificates on file expire within the current
                        year, so this is expected rather than a data problem, and
                        the levels fill once the period is set. Saying so here
                        stops it reading as "we hold nothing for these suppliers". */}
                    {certificateFill.report.notValid.length > 0 && (
                      <p className="mt-1 text-[11.5px] leading-5 text-amber-200/80">
                        {certificateFill.report.notValid.length} matched certificate
                        {certificateFill.report.notValid.length === 1 ? " is" : "s are"} not current
                        today, so their B-BBEE levels were left blank. Set the financial period on
                        the workbook and re-run “Fill from certificates” — a certificate that was
                        live during the measured period still counts.
                      </p>
                    )}
                    {certificateFill.report.conflicts.length > 0 && (
                      <p className="mt-1 text-[11.5px] leading-5 text-amber-200/80">
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
                    Certificate database unavailable — procurement was left exactly as extracted.
                  </p>
                ) : (
                  <p className="text-[11.5px] leading-5 text-[color:var(--body)]">
                    No new supplier details found in the certificate database.
                  </p>
                )}
              </ReviewSection>
            )}
          </div>
        </div>
      )}
        </motion.section>
      </motion.div>
    </div>
  );
}
