/**
 * Document-upload start for the ESG workbook — the ESG sibling of
 * `scorecard/DocumentUploadStart`.
 *
 * Same three acts, same lifecycle, same guarantees:
 *   1. The stage — a drop surface plus per-element batches driven by the ESG
 *      evidence matrix.
 *   2. Scanning theatre — a free structure-only quote, then (once tokens are
 *      authorised) the paid read, streamed per document over SSE.
 *   3. The reveal — an honest account of what was read, what was placed, and
 *      what was not, before anything touches the workbook.
 *
 * WHAT IS SHARED WITH THE B-BBEE FLOW
 *   - `ConfirmUploadDialog` is imported unchanged (it is domain-agnostic).
 *   - The token endpoints are the SAME ones: `/api/tokens/quote/:id` and
 *     `/api/tokens/authorize`. There is no ESG-specific payment path, on
 *     purpose — one wallet, one debit, one balance.
 *   - Document persistence is the SAME: `/api/parser-documents/upload` and
 *     `/api/parser-documents/:id/runs`, so ESG evidence lands in the same
 *     library, with the same immutable per-document run record.
 *
 * WHAT IS ESG-SPECIFIC
 *   - The parser endpoints (`/api/parser/esg/*`), which speak the ESG document
 *     matrix rather than the B-BBEE verification matrix.
 *   - There is no sector/size selector: the ESG scorecard is not chosen per
 *     sector at upload time, and the company already exists by the time this
 *     screen renders.
 *   - The workbook write goes through the ESG mapping seam
 *     (`esgParserInjection`), which is DELIBERATELY still a stub — see that
 *     file. Nothing is written to a workbook cell until it is implemented, and
 *     the reveal says so out loud.
 *
 * HARD RULE OBSERVED THROUGHOUT: never display a value the user did not
 * provide and the parser did not extract. Unknown renders as unknown.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  CloudUpload,
  CreditCard,
  FileText,
  FolderOpen,
  Leaf,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import ConfirmUploadDialog, { type PendingUpload } from "@/components/scorecard/ConfirmUploadDialog";
import EsgElementDocumentBatches, {
  esgBatchLabel,
  type EsgUploadOrigin,
} from "./EsgElementDocumentBatches";
import EsgExtractionSummary from "./EsgExtractionSummary";
import {
  applyEsgParserResult,
  esgCaseFileNames,
  esgUploadNameForSource,
  type EsgInjectionResult,
  type EsgParserCaseLike,
} from "./esgParserInjection";
import { writeEsgFlowSnapshot } from "./esgFlowSnapshot";

/** The free, structure-only price scan (POST /api/parser/esg/quote-files). */
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
  totals: {
    predictedInputTokens: number;
    predictedOutputTokens: number;
    azureCents: number;
    totalCents: number;
    isUpperBound: boolean;
  };
  expiresAt: string;
  notes: string[];
  /**
   * Whether the server will actually charge for this run. With the payment
   * gate off we show the work as information rather than offering a checkout
   * that cannot settle.
   */
  paymentRequired?: boolean;
}

/**
 * What a batch costs in credit tokens, and what the wallet holds. The server
 * converts the quote into tokens and reports the balance in the same call, so
 * the number shown and the number charged are the same number.
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

/** A full ESG evidence pack is large, but not unbounded. */
const MAX_UPLOAD_FILES = 100;

/**
 * How long the extraction may go without a single SSE event before we call it
 * dead.
 *
 * The stream emits per-document events throughout, so silence is not "still
 * working" — it is a lost connection or a stalled worker. Without this the tab
 * sits on a spinner indefinitely and the user has no way to tell a slow read
 * from a broken one. Generous, because a scanned 300-page pack legitimately
 * takes minutes per document.
 */
const STREAM_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Extensions the parser can read. Anything else is filtered with a warning.
 *
 * Mirrors SUPPORTED_UPLOAD_EXTENSIONS in the parser service — `.ppt` was
 * missing here while the server accepted it, so a real deck was refused before
 * it was ever offered.
 */
const READABLE = new Set([
  ".pdf", ".docx", ".doc", ".xlsx", ".xlsm", ".xls", ".pptx", ".ppt",
  ".csv", ".txt", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp",
]);

/**
 * The same list as an `accept` attribute, so the picker and the filter agree.
 * `Array.from` rather than a spread: this project's tsconfig targets below
 * ES2015 for iteration and a spread over a Set is a compile error here.
 */
const READABLE_ACCEPT = Array.from(READABLE).join(",");

/**
 * Fold a newly-read case into what we already had.
 *
 * A requote only ever pays for NEW documents, so previously-extracted ones must
 * survive. The new round wins on conflicts (it is the more recent read of that
 * filename) but can never delete an earlier good document.
 */
function mergeEsgCases(kept: EsgParserCaseLike | null, fresh: EsgParserCaseLike): EsgParserCaseLike {
  if (!kept) return fresh;
  const byName = <T extends { filename?: string }>(a: T[] = [], b: T[] = []): T[] => {
    const out = new Map<string, T>();
    for (const item of a) out.set(String(item.filename), item);
    for (const item of b) out.set(String(item.filename), item);
    return Array.from(out.values());
  };
  const byFileName = <T extends { file_name?: string }>(a: T[] = [], b: T[] = []): T[] => {
    const out = new Map<string, T>();
    for (const item of a) out.set(String(item.file_name), item);
    for (const item of b) out.set(String(item.file_name), item);
    return Array.from(out.values());
  };
  const freshFiles = new Set(esgCaseFileNames(fresh));
  return {
    ...kept,
    ...fresh,
    documents: byFileName(kept.documents, fresh.documents),
    unreadable_files: byFileName(kept.unreadable_files, fresh.unreadable_files),
    documents_detected: byName(kept.documents_detected, fresh.documents_detected),
    documents_needing_review: byName(kept.documents_needing_review, fresh.documents_needing_review),
    ai_entities: {
      ...(kept.ai_entities ?? {}),
      ...(fresh.ai_entities ?? {}),
      fields: { ...(kept.ai_entities?.fields ?? {}), ...(fresh.ai_entities?.fields ?? {}) },
      extractions: [
        // Keep earlier extractions, drop any whose source file was re-read.
        ...(kept.ai_entities?.extractions ?? []).filter(
          (e) => !freshFiles.has(String(e.sourceFile ?? "")),
        ),
        ...(fresh.ai_entities?.extractions ?? []),
      ],
    },
  };
}

/** A file's size in whatever unit the structure scan actually established. */
function fileUnits(file: ParserQuote["files"][number]): string {
  if (file.structure.pages) return `${file.structure.pages} page${file.structure.pages === 1 ? "" : "s"}`;
  if (file.structure.sheets) return `${file.structure.sheets} sheet${file.structure.sheets === 1 ? "" : "s"}`;
  if (file.structure.rows) return `${file.structure.rows.toLocaleString()} rows`;
  return "Structure scan";
}

export interface EsgDocumentUploadStartProps {
  /** The company whose workbook these documents will fill. */
  companyId: string;
  companyName?: string;
  /**
   * Write the mapped sections and land the user in the workbook. The host owns
   * the write so there is exactly one place that talks to the workbook API.
   */
  onComplete: (result: {
    injection: EsgInjectionResult;
    parserCase: EsgParserCaseLike | null;
    /** Library ids of every persisted upload, for filing under the company. */
    documentIds?: string[];
  }) => Promise<void>;
  /** True while the host is writing to the workbook. */
  busy?: boolean;
  /** Back to the "how would you like to begin" choice. */
  onBack?: () => void;
  /**
   * Files to stage on mount.
   *
   * The Excel route hands its workbook over this way when the workbook is not
   * OUR template: rather than dead-ending on "none of its sheets match", the
   * same file is read as evidence by the parser, which maps a register's
   * columns instead of requiring its tab to be named correctly.
   */
  initialFiles?: File[];
  /**
   * Open on the dropzone alone — set when the user already chose "upload
   * documents" in the workspace. The fifteen element batches appear the moment
   * there is a file for them to organise.
   */
  focused?: boolean;
}

export function EsgDocumentUploadStart({
  companyId,
  companyName,
  focused = false,
  onComplete,
  busy = false,
  onBack,
  initialFiles,
}: EsgDocumentUploadStartProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [libraryWarning, setLibraryWarning] = useState<string | null>(null);
  /** What the server refunded for the run that just ended, in its own words. */
  const [refundNotice, setRefundNotice] = useState<string | null>(null);
  const [parserCase, setParserCase] = useState<EsgParserCaseLike | null>(null);
  const persistedDocumentsRef = useRef<Map<string, string>>(new Map());
  /** The phase banner reporting the paid read — scrolled to when it starts. */
  const extractionPhaseRef = useRef<HTMLDivElement | null>(null);
  /** Per-file extraction progress, keyed by the file's name. */
  const [docProgress, setDocProgress] = useState<Record<string, "parsing" | "done" | "error">>({});
  /** True once every file is read and the cross-document resolve is running. */
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [quote, setQuote] = useState<ParserQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  /**
   * Has the user said they are FINISHED adding documents? The quote is free and
   * re-issued on every change, but showing a checkout the moment the first file
   * lands makes staging one element feel like being marched to payment with the
   * rest of the evidence still on the desk. Reset whenever the list changes.
   */
  const [doneStaging, setDoneStaging] = useState(false);
  const [paying, setPaying] = useState(false);
  const [tokenCost, setTokenCost] = useState<TokenCost | null>(null);
  /** Which batch each staged file was filed under. Presentation only. */
  const [filedBatchByFile, setFiledBatchByFile] = useState<Record<string, string>>({});
  /** Files chosen but not yet confirmed. The double-check dialog owns these. */
  const [pendingUpload, setPendingUpload] = useState<(PendingUpload & { origin: EsgUploadOrigin }) | null>(null);
  /** The case as of now, for the merge at the end of a read (which outlives the render it started in). */
  const parserCaseRef = useRef<EsgParserCaseLike | null>(null);
  useEffect(() => {
    parserCaseRef.current = parserCase;
  }, [parserCase]);
  /**
   * The files already read and paid for, by persistence key.
   *
   * A second paid round in one sitting used to be unreachable: every gate keyed
   * off `parserCase`, so a forgotten document could be staged after the read
   * but never priced or read. Now only UNREAD files are priced and read, their
   * result is merged through `mergeEsgCases`, and a read file is part of the
   * case — it can't be removed and is never charged for again.
   */
  const [readKeys, setReadKeys] = useState<Set<string>>(() => new Set());
  const readKeysRef = useRef(readKeys);
  useEffect(() => {
    readKeysRef.current = readKeys;
  }, [readKeys]);
  /** Files a folder upload could not read — a warning, not an error. */
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  /** Monotonic id so only the latest quote request writes state (race guard). */
  const quoteSeqRef = useRef(0);
  /** Aborts any in-flight quote when a newer one starts. */
  const quoteAbortRef = useRef<AbortController | null>(null);
  /** Bumped outside runQuote (file cap, file removal) to invalidate a quote. */
  const quoteRequestRef = useRef(0);

  /**
   * The mapping seam. While `applyEsgParserResult` is a stub this reports every
   * extracted value as unplaced and writes nothing — see `esgParserInjection`.
   */
  const injection = useMemo<EsgInjectionResult>(
    () => applyEsgParserResult(parserCase),
    [parserCase],
  );

  /**
   * Matrix document ids the parser actually read something out of, so the
   * element checklist shows real coverage instead of a static wish list. Only
   * extractions that produced values count — a document we recognised but got
   * nothing from is not evidence.
   */
  const satisfiedDocumentIds = useMemo<string[]>(
    () =>
      (parserCase?.ai_entities?.extractions ?? [])
        .filter((extraction) => (extraction.values?.length ?? 0) > 0)
        .map((extraction) => String(extraction.documentId ?? ""))
        .filter(Boolean),
    [parserCase],
  );

  /** The quote's row for a file — what we know from the free structure scan. */
  const quoted = (filename: string) => quote?.files.find((f) => f.filename === filename);

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

  /**
   * Scan the documents for a PRICE only. Reads structure and text layers
   * locally — never OCRs, never calls the model, never extracts entities. It is
   * free, and it is all we are allowed to do before payment.
   */
  const runQuote = async (list: File[]) => {
    if (list.length === 0) return;
    const seq = ++quoteSeqRef.current;
    const requestId = ++quoteRequestRef.current;
    const isLatest = () => quoteSeqRef.current === seq && quoteRequestRef.current === requestId;
    // Cancel any quote still in flight so two rapid uploads cannot both run — a
    // stranded second request leaves `quoting` stuck true and hides the payment
    // panel forever.
    quoteAbortRef.current?.abort();
    const controller = new AbortController();
    quoteAbortRef.current = controller;
    setQuoting(true);
    setParseError(null);
    try {
      const form = new FormData();
      for (const f of list) form.append("files", f, f.name);
      const res = await fetch("/api/parser/esg/quote-files", {
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

  const prepareAndQuote = async (list: File[]): Promise<void> => {
    setLibraryWarning(null);
    // The WHOLE pipeline is "checking" — saving to the library and then
    // pricing. `quoting` used to flip on only when pricing began, so during
    // the save the Done button sat enabled next to whatever quote the
    // PREVIOUS batch had left behind, and clicking it opened a checkout
    // priced for a different set of files. Claim the checking state and drop
    // the stale quote before anything async happens.
    const requestId = ++quoteRequestRef.current;
    // Price only what has not been read: a document read in an earlier round is
    // paid for and already in the case.
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
   * Price the quote in credit tokens as soon as we have one.
   *
   * Deliberately a separate call from the quote itself: the parser knows what
   * reading these files costs, the web app knows what the organisation holds,
   * and only the second is allowed to answer "can you afford this". Failing to
   * price is non-fatal — the panel falls back to showing the work without a
   * token figure rather than blocking the flow.
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
    return () => {
      cancelled = true;
    };
  }, [quote?.quoteId]);

  /**
   * Take the user to the phase banner the moment the paid read starts.
   * Pressing process swaps a panel below a long staged list, so without this
   * the only visible change is a button going quiet.
   */
  useEffect(() => {
    if (!parsing) return;
    const frame = requestAnimationFrame(() => {
      extractionPhaseRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [parsing]);

  /**
   * Save one immutable, lossless run for every document the parser touched.
   *
   * Driven off `esgCaseFileNames`, NOT off one key: the ESG routes report the
   * file list as `documents:[{file_name}]` while the B-BBEE ones report
   * `documents_detected`. Reading only the latter (as the B-BBEE component
   * does, correctly, for its own parser) would have written zero runs here and
   * done it silently — a paid read with nothing archived to show for it.
   *
   * One file can produce SEVERAL extractions (a workbook whose sheets match
   * different specs), so every extraction for a file rides in its run record.
   */
  const persistParserRuns = async (
    data: EsgParserCaseLike,
    list: File[],
    docErrors: Map<string, string>,
  ): Promise<void> => {
    const extractions = data.ai_entities?.extractions ?? [];
    const reviewRows = data.documents_needing_review ?? [];
    const fileNames = esgCaseFileNames(data);
    if (fileNames.length === 0) return;

    // A workbook comes back as one source per sheet ("File.xlsx › Sheet"); its
    // run belongs to the file that was uploaded, carrying every sheet.
    const uploadNames = list.map((candidate) => candidate.name);
    const uploadOf = (source: unknown) => esgUploadNameForSource(source, uploadNames);
    const problems = [
      ...(data.unreadable_files ?? []).map((u) => [String(u.file_name ?? ""), String(u.reason ?? "")] as const),
      ...Array.from(docErrors.entries()),
    ];
    const filesInCase = Array.from(
      new Set(fileNames.map(uploadOf).filter((name): name is string => Boolean(name))),
    );

    const tasks = filesInCase.map(async (filename) => {
      const file = list.find((candidate) => candidate.name === filename);
      if (!file) return;
      const documentId = await persistDocument(file);
      const mine = extractions.filter((e) => uploadOf(e.sourceFile) === filename);
      const detected = (data.documents_detected ?? []).find((d) => uploadOf(d.filename) === filename);
      const readSomething = mine.some((e) => (e.values?.length ?? 0) > 0);
      const partProblems = problems
        .filter(([source]) => uploadOf(source) === filename)
        .map(([source, reason]) => (source === filename ? reason : `${source}: ${reason}`));
      // A workbook failed only if nothing in it was read; one unreadable sheet
      // in an otherwise-read workbook is a warning on that workbook.
      const failure = !readSomething && partProblems.length > 0 ? partProblems.join("; ") : null;
      const exceptions = [
        ...mine.flatMap((e) => (e.exceptions ?? []).map((x) => String(x))),
        ...(failure ? [] : partProblems),
      ];
      const missingFields = Array.from(new Set(mine.flatMap((e) => e.missingFields ?? [])));

      const parserOutput = {
        file_id: documentId,
        filename,
        domain: "esg",
        document_type: mine[0]?.documentName ?? detected?.document_type ?? "Unknown",
        // The ESG analogue of a pillar. Kept under the same key so the document
        // library renders both domains with one template.
        pillar: mine[0]?.element ?? detected?.element ?? "",
        extracted_fields: Object.fromEntries(
          mine.flatMap((e) => (e.values ?? []).map((value) => [value.field, value.value])),
        ),
        // The full per-spec detail, lossless, so a value can always be traced
        // back to the prompt that found it.
        extractions: mine,
        validation: {
          passed: !failure && readSomething,
          warnings: exceptions,
          errors: failure ? [failure] : (detected?.validation?.errors ?? []),
          missing_fields: missingFields.length > 0
            ? missingFields
            : (detected?.validation?.missing_fields ?? []),
        },
        audit_trail: {
          source_file: filename,
          matched_patterns: [],
          rules_applied: [],
          graph_version: "unknown",
          requires_human_review: Boolean(failure) || exceptions.length > 0,
          classification_candidates: [],
          rejected_calculator_keys: [],
        },
      };
      const reviewReasons = [
        ...reviewRows.filter((row) => uploadOf(row.filename) === filename).flatMap((row) => row.reasons ?? []),
        ...(failure ? [failure] : []),
        ...exceptions,
      ];
      const res = await fetch(`/api/parser-documents/${encodeURIComponent(documentId)}/runs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parserOutput, caseId: data.case_id ?? null, reviewReasons }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Could not save parser result for ${filename}`);
      }
    });
    const results = await Promise.allSettled(tasks);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} parser result${failures.length === 1 ? "" : "s"} could not be saved to the document library.`,
      );
    }
  };

  /**
   * The paid work. Only runs once the quote is authorised, and sends the quote
   * id so the server can verify payment and that these are the exact files that
   * were paid for. Resolves whether a result came back.
   */
  const runExtraction = async (list: File[], quoteId: string): Promise<boolean> => {
    let delivered = false;
    setParsing(true);
    setResolving(false);
    setResolveProgress(null);
    setParseError(null);
    setDocProgress({});

    // A stream that has gone quiet is a stream that has died. ANY bytes reset
    // this — the parser's 15-second ": ping" keep-alive included. Resetting only
    // on named events let a long workbook (one sheet per vehicle, minutes per
    // sheet) time out while the parser was still working and still paid for.
    const controller = new AbortController();
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, STREAM_IDLE_TIMEOUT_MS);
    };

    try {
      await persistSelectedDocuments(list);
      const form = new FormData();
      for (const f of list) form.append("files", f, f.name);
      form.append("case_id", `esg_workbook_${companyId || "unknown"}_${Date.now()}`);
      form.append("quote_id", quoteId);
      if (companyId) form.append("company_id", companyId);

      resetIdleTimer();
      // Streaming endpoint: emits per-file doc-start/doc-done SSE events so the
      // list fills up as each document is read, then a single result event.
      const res = await fetch("/api/parser/esg/resolve-case-files-stream", {
        method: "POST",
        credentials: "include",
        body: form,
        signal: controller.signal,
      });
      if (res.status === 402 || res.status === 409 || res.status === 410) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "Payment could not be verified for these documents");
      }
      if (!res.ok || !res.body) throw new Error(`Parser returned ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let data: EsgParserCaseLike | null = null;
      let streamError: string | null = null;
      /**
       * Per-file failures reported live on the stream. They do NOT appear in
       * the streaming result payload (only the non-streaming route carries
       * `unreadable_files`), so this is the only record of them — and it has to
       * reach the run archive, or a document that failed looks identical to one
       * that was never uploaded.
       */
      const docErrors = new Map<string, string>();

      const handle = (event: string, payload: any) => {
        resetIdleTimer();
        switch (event) {
          case "doc-start":
            if (payload?.fileName) setDocProgress((p) => ({ ...p, [payload.fileName]: "parsing" }));
            break;
          case "doc-done":
            if (payload?.fileName) setDocProgress((p) => ({ ...p, [payload.fileName]: "done" }));
            break;
          case "doc-error":
            if (payload?.fileName) {
              setDocProgress((p) => ({ ...p, [payload.fileName]: "error" }));
              docErrors.set(
                String(payload.fileName),
                String(payload.message ?? "The parser could not read this document"),
              );
            }
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

      // Parse the SSE stream block by block (blocks separated by a blank line).
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdleTimer();
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
            try {
              handle(eventType, JSON.parse(dataLines.join("\n")));
            } catch {
              /* keep-alive or comment frame */
            }
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!data) throw new Error("The parser did not return a result.");
      delivered = true;

      try {
        await persistParserRuns(data, list, docErrors);
        setLibraryWarning(null);
      } catch (persistenceError) {
        console.error("[EsgDocumentUploadStart] Parser result persistence failed", persistenceError);
        setLibraryWarning(
          persistenceError instanceof Error
            ? persistenceError.message
            : "Parser results were not saved to the document library.",
        );
      }
      // Merge with anything already paid for and read in an earlier round, so a
      // requote never loses (or re-charges for) documents we already have.
      const mergedCase = mergeEsgCases(parserCaseRef.current, data);
      parserCaseRef.current = mergedCase;
      setParserCase(mergedCase);
      // These files are now part of the case: never priced, charged or read again.
      const nowRead = new Set(readKeysRef.current);
      for (const f of list) nowRead.add(filePersistenceKey(f));
      readKeysRef.current = nowRead;
      setReadKeys(nowRead);
      setQuote(null);
      setTokenCost(null);
      setDoneStaging(false);
      // Tokens have just been spent on this result — make it survive leaving
      // the flow, even before "continue to workbook" is pressed. The host flow
      // restores it (straight to review) on its next mount, and overwrites this
      // with the proposed entity name once the user does continue.
      const snapshotInjection = applyEsgParserResult(mergedCase);
      // The honest not-placed list IS the improvement backlog — record it
      // server-side (fire-and-forget) so "what should the mapper learn next?"
      // is answerable from data instead of memory. Never blocks the flow.
      try {
        const byKey = new Map<string, { field: string; context: string; reason: string; count: number }>();
        for (const u of snapshotInjection.unplaced) {
          const key = `${u.field}::${u.reason}`;
          const row = byKey.get(key) ?? { field: u.field, context: u.element, reason: u.reason, count: 0 };
          row.count += 1;
          byKey.set(key, row);
        }
        void Promise.resolve(
          fetch("/api/telemetry/placement", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              domain: "esg",
              caseId: (data as { case_id?: string } | null)?.case_id ?? null,
              fileCount: list.length,
              valuesRead: snapshotInjection.valuesRead,
              placedCount: snapshotInjection.placed.length,
              unplacedCount: snapshotInjection.unplaced.length,
              conflictCount: snapshotInjection.conflicts.length,
              unplaced: Array.from(byKey.values()),
            }),
          }),
        ).catch(() => {});
      } catch {
        // telemetry must never cost a user their extraction
      }
      writeEsgFlowSnapshot({
        savedAt: new Date().toISOString(),
        entityName: "",
        nameSource: "none",
        work: {
          route: "documents",
          patches: snapshotInjection.patches,
          injection: snapshotInjection,
          parserCase: mergedCase,
          documentIds: Array.from(new Set(persistedDocumentsRef.current.values())),
          excel: null,
        },
      });
    } catch (err) {
      if (timedOut || (err as Error)?.name === "AbortError") {
        // Results are only saved once the whole batch comes back, so nothing
        // from this run is in the library — the old copy said otherwise.
        setParseError(
          "The document reader stopped responding for 10 minutes, so we stopped waiting. No results came back, so nothing was placed in your workbook or saved to your document library. Try the documents again in a smaller batch.",
        );
      } else {
        setParseError(err instanceof Error ? err.message : "Could not read the documents");
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      setParsing(false);
      setResolving(false);
    }
    return delivered;
  };

  /**
   * Ask the server to settle the run that just ended. Whatever the run failed
   * to deliver is refunded there — decided from the parser's own record of the
   * run, never from anything this screen reports — and the answer says what
   * came back, so a refund shows the moment it happens.
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
        if (typeof body.balance === "number") {
          setTokenCost((prev) => (prev ? { ...prev, balance: body.balance } : prev));
        }
        window.dispatchEvent(new CustomEvent("okiru:tokens-changed"));
      } else if (body?.state === "pending" && body.queued && body.reason) {
        // Owed, and waiting on the organisation's daily refund allowance.
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
   * Spend tokens, then read.
   *
   * The debit is server-side and idempotent, so a double-click charges once. If
   * the balance will not cover the batch we say so with the exact shortfall and
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
        setTokenCost((prev) =>
          prev
            ? {
                ...prev,
                balance: body?.balance ?? prev.balance,
                sufficient: false,
                shortfall: body?.shortfall ?? prev.shortfall,
              }
            : prev,
        );
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

  /**
   * Whole-folder upload. A folder carries everything — including desktop.ini,
   * thumbnails and whatever else lives alongside the evidence. Take what we can
   * read, say plainly what was skipped, and let the user decide.
   */
  const addFolder = (incoming: File[], origin?: EsgUploadOrigin) => {
    // Only the silent drops belong here — OS bookkeeping the user never chose
    // and would not want listed back at them. Deciding what is READABLE now
    // lives in `addFiles`, so a dragged folder, a dragged file and a picked
    // file are all judged by the same rule.
    const candidates = incoming.filter(
      (file) => !(file.name.startsWith(".") || file.name === "Thumbs.db" || file.name === "desktop.ini"),
    );
    addFiles(candidates, origin);
  };

  /**
   * A batch was picked. Nothing is staged yet — the double-check dialog gets
   * first look, because the cheapest moment to catch the wrong reporting year
   * or another site's meter readings is before we have read anything.
   */
  const handleBatchPick = (incoming: File[], origin: EsgUploadOrigin) => {
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

  const addFiles = (incoming: File[], origin?: EsgUploadOrigin) => {
    // Skip OS / Office junk that is never a real document: Excel/Word lock
    // files (~$name.xlsx), macOS resource forks (._name), Thumbs.db, .DS_Store.
    const isJunk = (name: string) => {
      const base = name.split(/[\\/]/).pop() ?? name;
      return /^~\$/.test(base) || /^\._/.test(base) || /^\.(ds_store)$/i.test(base) || /^thumbs\.db$/i.test(base);
    };
    const skipped = incoming.filter((f) => isJunk(f.name)).map((f) => f.name.split(/[\\/]/).pop() ?? f.name);
    if (skipped.length > 0) {
      setParseError(
        `Skipped ${skipped.length} temporary file${skipped.length === 1 ? "" : "s"} (${skipped.slice(0, 2).join(", ")}${skipped.length > 2 ? "…" : ""}) — these are Excel/Office lock files, not documents. Close the workbook in Excel and upload the real file.`,
      );
    }

    /**
     * Types the parser cannot read — a README beside the evidence, an .eml
     * export, a stray .zip.
     *
     * This used to run only for whole-folder uploads, so a drag-and-drop or a
     * hand-picked batch sent them to the server, where ONE of them failed the
     * entire multipart request. The server no longer does that, but catching it
     * here is what turns a server round-trip into an immediate, specific
     * "these two were not documents" — before anything is priced.
     */
    const unreadable: string[] = [];
    const usable = incoming.filter((f) => {
      if (isJunk(f.name)) return false;
      const dot = f.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : f.name.slice(dot).toLowerCase();
      if (READABLE.has(ext) && f.size > 0) return true;
      unreadable.push(f.name.split(/[\\/]/).pop() ?? f.name);
      return false;
    });
    setSkippedFiles(unreadable);
    if (usable.length === 0) return;
    const next = [...files];
    for (const f of usable) {
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    if (next.length > MAX_UPLOAD_FILES) {
      quoteRequestRef.current += 1;
      setParseError(
        `You can upload up to ${MAX_UPLOAD_FILES} documents at once. Remove ${next.length - MAX_UPLOAD_FILES} and try again.`,
      );
      setQuote(null);
      setQuoting(false);
      return;
    }
    setFiles(next);
    // A batch you have just changed is a batch you are still working on.
    setDoneStaging(false);
    if (origin) {
      setFiledBatchByFile((prev) => {
        const merged = { ...prev };
        for (const f of usable) merged[f.name] = origin.batchId;
        return merged;
      });
    }
    void prepareAndQuote(next);
  };

  /**
   * Stage anything the host handed over on mount, exactly once.
   *
   * Guarded by a ref rather than by `files.length`: `addFiles` quotes, and a
   * quote that re-fired on every render would bill the user for a batch they
   * only chose once. `initialFiles` is a handover, not a controlled prop.
   */
  const stagedInitial = useRef(false);
  useEffect(() => {
    if (stagedInitial.current) return;
    if (!initialFiles || initialFiles.length === 0) return;
    stagedInitial.current = true;
    addFiles(initialFiles);
    // addFiles is recreated every render and is not a dependency worth chasing:
    // the ref is what makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  const removeFile = (name: string) => {
    // A read file is paid for and folded into the case; it stays.
    const target = files.find((f) => f.name === name);
    if (target && !isUnread(target)) return;
    const next = files.filter((f) => f.name !== name);
    setFiles(next);
    setDoneStaging(false);
    setFiledBatchByFile((prev) => {
      const merged = { ...prev };
      delete merged[name];
      return merged;
    });
    quoteRequestRef.current += 1;
    setQuote(null);
    // Re-price what is still unread; never reset the case (that threw a paid read away).
    if (next.some(isUnread)) void prepareAndQuote(next);
    else setQuoting(false);
  };

  /**
   * What actually came of each file, once the read is done.
   *
   * The ESG result has no per-document verdict — it has extractions with a
   * `sourceFile`. So the verdict IS the extraction: values means read, no
   * values means the parser got nothing out of it, and absent means it never
   * reached the parser at all. Derived rather than assumed, so the list can
   * never claim a document was read when nothing came back from it.
   */
  const readOutcomeByFile = useMemo<Record<string, "values" | "none">>(() => {
    if (!parserCase) return {};
    const out: Record<string, "values" | "none"> = {};
    for (const name of esgCaseFileNames(parserCase)) out[name] = "none";
    for (const extraction of parserCase.ai_entities?.extractions ?? []) {
      const name = String(extraction.sourceFile ?? "");
      if (!name) continue;
      if ((extraction.values?.length ?? 0) > 0) out[name] = "values";
      else out[name] ??= "none";
    }
    return out;
  }, [parserCase]);

  const revealed = Boolean(parserCase && !parsing && files.length > 0);
  // Requires `doneStaging`: collapsing the stage into the checkout the moment a
  // quote landed is what left people with "files appear but there is nowhere to
  // carry on".
  const quoteReady = Boolean(quote && doneStaging && unreadFiles.length > 0 && !quoting && !parsing);
  /** Whether reading the unread files spends tokens, and whether the balance covers it. */
  const readCharging = Boolean(quote && quote.paymentRequired !== false && tokenCost !== null);
  const readUnaffordable = readCharging && tokenCost !== null && !tokenCost.sufficient && !tokenCost.alreadyAuthorized;
  /** One click from the bar under the uploader — the breakdown stays one click away. */
  const readNow = () => {
    if (!quote) return;
    if (readCharging) void spendAndExtract();
    else void runExtraction(unreadFiles, quote.quoteId);
  };

  const readCount = Object.values(docProgress).filter((s) => s === "done").length;
  const failedDocuments = Object.entries(docProgress)
    .filter(([, status]) => status === "error")
    .map(([name]) => name);

  return (
    <div data-testid="esg-document-upload-start">
      <style>{`
        @keyframes esgFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes esgShimmer { from { transform: translateX(-100%); } to { transform: translateX(220%); } }
        .esg-fade-up { animation: esgFadeUp 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
      `}</style>

      <div className="mb-5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--esg-text2,rgba(255,255,255,0.56))] transition-colors hover:text-white"
            data-testid="esg-upload-back"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Choose a different way to start
          </button>
        )}
        {/* Document scale, left aligned, matching the B-BBEE step exactly. A
            34px centred headline over a working step read like a landing page. */}
        <h3 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-[var(--esg-text,#fff)]">
          {quoteReady && quote
            ? quote.paymentRequired === false
              ? "Review your documents"
              : "Review and process"
            : parserCase
              ? "Your ESG evidence"
              : "Add your ESG evidence"}
        </h3>
        <p className="mt-1.5 text-[13px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]">
          {quoteReady && quote
            ? quote.paymentRequired === false
              ? "Processing is free. Review the documents below, then continue."
              : "Nothing is read until you spend."
            : parserCase
              ? "Read and placed below. Forgot one? Add it — only the new documents are read and charged."
              : `Utility bills, fuel statements, waste manifests, certificates, registers and policies${companyName ? ` for ${companyName}` : ""}. We identify what is present, what is missing and what needs review.`}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept={READABLE_ACCEPT}
        onChange={(e) => {
          if (e.target.files?.length) addFiles(Array.from(e.target.files));
          e.currentTarget.value = "";
        }}
        data-testid="esg-docs-file-input"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(e) => {
          if (e.target.files?.length) addFolder(Array.from(e.target.files));
          e.currentTarget.value = "";
        }}
        data-testid="esg-docs-folder-input"
      />

      <AnimatePresence mode="wait" initial={false}>
        {quoteReady &&
          (() => {
            const totalPages = quote!.files.reduce((sum, file) => sum + (file.structure.pages ?? 0), 0);
            const spreadsheetCount = quote!.files.filter((file) => (file.structure.sheets ?? 0) > 0).length;
            // The server decides whether tokens are involved. With the gate off
            // this is a review step, not a spend — never show a cost we won't take.
            const charging = quote!.paymentRequired !== false && tokenCost !== null;
            const cannotAfford =
              charging && tokenCost !== null && !tokenCost.sufficient && !tokenCost.alreadyAuthorized;
            const expiry = new Date(quote!.expiresAt);
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
                key="esg-processing-quote"
                layout
                initial={{ opacity: 0, x: 28, scale: 0.985 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -24, scale: 0.985 }}
                transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                className="mb-4 rounded-[22px] border border-[var(--esg-glass-border,rgba(255,255,255,0.07))] bg-[var(--esg-input-bg,#0e0e10)] p-5"
                data-testid="esg-payment-summary"
              >
                {/* Reviewing the cost is not a one-way door. */}
                <button
                  type="button"
                  onClick={() => setDoneStaging(false)}
                  className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--esg-text2,rgba(255,255,255,0.56))] transition-colors hover:text-white"
                  data-testid="esg-button-add-more-documents"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Add more documents
                </button>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
                      {charging ? "This batch costs" : "Ready to process"}
                    </p>
                    <h4
                      className="mt-2 text-[30px] font-semibold leading-none text-[var(--esg-text,#fff)]"
                    >
                      {charging && tokenCost
                        ? `${tokenText(tokenCost.tokens)} tokens`
                        : `${quote!.files.length} document${quote!.files.length === 1 ? "" : "s"}`}
                    </h4>
                    <p className="mt-2 max-w-sm text-[13px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]">
                      {charging
                        ? "Longer documents and scans cost more to read. Nothing is spent until you start."
                        : "Check what we picked up before we read your documents."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--esg-glass-border,rgba(255,255,255,0.07))] bg-[var(--esg-section-bg,#141416)] px-4 py-3 text-right">
                    {charging && tokenCost ? (
                      <>
                        <p className="text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">Balance after</p>
                        <p
                          className={`mt-1 text-[13px] font-medium tabular-nums ${
                            tokenCost.sufficient ? "text-[color:var(--body)]" : "text-red-300"
                          }`}
                          data-testid="esg-balance-after"
                        >
                          {tokenText(Math.max(0, tokenCost.balanceAfter))}
                        </p>
                        <p className="mt-0.5 text-[10.5px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
                          of {tokenText(tokenCost.balance)} now
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">Expires</p>
                        <p className="mt-1 text-[13px] font-medium text-[color:var(--body)]">{expiryLabel}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                    <p className="text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">Documents</p>
                    <p className="mt-1 text-[20px] font-semibold text-[var(--esg-text,#fff)]">
                      {quote!.files.length}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                    <p className="text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">Pages</p>
                    <p className="mt-1 text-[20px] font-semibold text-[var(--esg-text,#fff)]">
                      {totalPages || "Auto"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                    <p className="text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">Workbooks</p>
                    <p className="mt-1 text-[20px] font-semibold text-[var(--esg-text,#fff)]">
                      {spreadsheetCount}
                    </p>
                  </div>
                </div>

                {/* Each document shows the credit tokens IT costs, under the
                    effort rule that priced it — the total is explained line by
                    line rather than asserted. */}
                <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--esg-glass-border,rgba(255,255,255,0.07))]">
                  <div className="grid grid-cols-[minmax(0,1.6fr)_110px_140px] gap-3 border-b border-white/[0.06] bg-white/[0.035] px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--esg-text3,rgba(255,255,255,0.32))] max-md:hidden">
                    <span>Document</span>
                    <span>Effort</span>
                    <span className="text-right">{charging ? "Tokens" : "Size"}</span>
                  </div>
                  {quote!.files.map((file) => {
                    const units = fileUnits(file);
                    const priced = tokenCost?.files?.find((f) => f.filename === file.filename);
                    const effort = priced
                      ? EFFORT_LABELS[priced.effort] ?? "Standard"
                      : file.requiresOcr
                        ? "High"
                        : "Standard";
                    return (
                      <div
                        key={file.filename}
                        className="grid gap-2 border-b border-white/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.6fr)_110px_140px] md:items-center md:gap-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[#f2f2f7]">{file.filename}</p>
                          <p className="mt-0.5 text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
                            <span className="md:hidden">{effort} effort · </span>
                            {units}
                            {charging && priced ? (
                              <span className="md:hidden"> · {tokenText(priced.tokens)} tokens</span>
                            ) : null}
                          </p>
                        </div>
                        <span className="hidden text-[12px] text-[var(--esg-text2,rgba(255,255,255,0.56))] md:block">
                          {effort}
                        </span>
                        <span className="hidden text-[12px] tabular-nums text-[var(--esg-text2,rgba(255,255,255,0.56))] md:block md:text-right">
                          {charging && priced ? `${tokenText(priced.tokens)} tokens` : units}
                        </span>
                      </div>
                    );
                  })}
                  {charging && (tokenCost?.minimumTopUp ?? 0) > 0 && (
                    <div
                      className="grid gap-2 border-b border-white/[0.05] px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_110px_140px] md:items-center md:gap-3"
                      data-testid="esg-quote-minimum-charge"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[var(--esg-text2,rgba(255,255,255,0.56))]">Small-batch minimum</p>
                        <p className="mt-0.5 text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
                          Batches this small are topped up to the minimum processing charge.
                        </p>
                      </div>
                      <span className="hidden md:block" />
                      <span className="text-[12px] tabular-nums text-[var(--esg-text2,rgba(255,255,255,0.56))] md:text-right">
                        {tokenText(tokenCost!.minimumTopUp!)} tokens
                      </span>
                    </div>
                  )}
                  <div className="grid gap-2 border-t border-white/[0.12] bg-white/[0.045] px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_110px_140px] md:items-center md:gap-3">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text2,rgba(255,255,255,0.56))]">
                      {charging ? "Total" : "This batch"}
                    </span>
                    <span className="hidden md:block" />
                    <span
                      className="text-[14px] font-bold text-[var(--esg-text,#fff)] md:text-right"
                      data-testid="esg-quote-total-cost"
                    >
                      {charging && tokenCost
                        ? `${tokenText(tokenCost.tokens)} tokens`
                        : `${quote!.files.length} document${quote!.files.length === 1 ? "" : "s"}`}
                    </span>
                  </div>
                </div>

                {/* The rules the prices above came from — served by the same
                    endpoint that priced them, so the explanation cannot drift
                    from the charge. */}
                {charging && (tokenCost?.effortRules?.length ?? 0) > 0 && (
                  <div
                    className="mt-3 rounded-2xl border border-white/[0.06] bg-[color:var(--ink-2)] p-4"
                    data-testid="esg-effort-rules"
                  >
                    <p className="text-[12px] font-semibold text-[var(--esg-text,#fff)]">How effort sets the token cost</p>
                    <div className="mt-2 space-y-1.5">
                      {tokenCost!.effortRules!.map((rule) => (
                        <p key={rule.tier} className="text-[11.5px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]">
                          <span className="font-semibold text-[color:var(--body)]">{rule.label}</span> — {rule.rule}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {!charging && (
                  <p className="mt-3 text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
                    Processing is not being charged for this run.
                  </p>
                )}

                {cannotAfford && tokenCost && (
                  <div
                    className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/[0.06] p-4"
                    data-testid="esg-insufficient-tokens"
                    role="alert"
                  >
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-red-200">
                      <AlertTriangle className="h-4 w-4" />
                      {tokenText(tokenCost.shortfall)} tokens short
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]">
                      This batch needs {tokenText(tokenCost.tokens)} tokens and you have{" "}
                      {tokenText(tokenCost.balance)}. Top up, or remove some documents and process the
                      rest first.
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

                {charging && quote!.totals.isUpperBound && (
                  <p className="mt-3 text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
                    Scanned documents are estimated conservatively. You will not be charged more than
                    this.
                  </p>
                )}

                <div className="mt-5 space-y-2">
                  <button
                    onClick={() => void (charging ? spendAndExtract() : runExtraction(unreadFiles, quote!.quoteId))}
                    disabled={paying || parsing || cannotAfford}
                    className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-[15px] font-semibold transition-colors disabled:opacity-50"
                    style={{ background: "var(--esg-acc-e, #1de9a0)", color: "#080e14" }}
                    data-testid={charging ? "esg-button-spend-tokens" : "esg-button-process"}
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
          })()}

        {!quoteReady && (
          <motion.div
            key={quoting ? "esg-pricing" : parserCase ? "esg-parsed" : "esg-upload"}
            layout
            initial={{ opacity: 0, x: -22, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.985 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="relative cursor-pointer overflow-hidden rounded-[20px] text-center transition-all duration-300"
            style={{
              background: dragActive ? "#111827" : "var(--esg-input-bg, #0e0e10)",
              border: `1px dashed ${dragActive ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)"}`,
              padding: files.length > 0 ? "16px 18px" : "28px 20px 26px",
              transform: dragActive ? "scale(1.008)" : "scale(1)",
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
            }}
            data-testid="esg-docs-drop-zone"
          >
            {files.length === 0 ? (
              <>
                <div
                  className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    transform: dragActive ? "scale(1.1)" : "scale(1)",
                  }}
                >
                  <CloudUpload className="h-5 w-5 text-[color:var(--body)]" />
                </div>
                {/* No heading: the step above already says "Add your ESG
                    evidence", and the button says upload. Saying it three
                    times is what made the step feel like a second request. */}
                <p className="mx-auto mb-4 max-w-sm text-[13px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]">
                  Utility bills, fuel statements, waste manifests and registers.
                  PDF, Word, Excel or scans.
                </p>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7] focus:outline-none focus:ring-4 focus:ring-white/[0.08]"
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                  data-testid="esg-button-upload-documents"
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
                  data-testid="esg-button-upload-folder"
                >
                  <FolderOpen className="h-4 w-4" />
                  Upload a folder
                </button>
                <p className="mt-3 text-[11px] text-[#86868b]">
                  Token cost shown before anything is read.
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[var(--esg-text2,rgba(255,255,255,0.56))] transition-colors hover:text-[var(--esg-acc-e,#1de9a0)]">
                <Leaf className="h-3.5 w-3.5" />
                <span className="text-[13px] font-medium">Add more documents</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Folder upload skipped some files. A warning, not an error. */}
      {skippedFiles.length > 0 && (
        <div
          className="mt-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4"
          data-testid="esg-skipped-files-warning"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            {/* Not "in that folder" any more: the same filter now runs for a
                dragged file and a picked one, so this banner is reachable
                without a folder ever being involved. */}
            {skippedFiles.length} file{skippedFiles.length === 1 ? "" : "s"} could not be read
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]">
            We only read PDFs, Word, Excel, PowerPoint, CSV and images. Everything else was left out —
            if one of these was evidence, convert it and add it.
          </p>
          <p className="mt-2 truncate font-mono text-[11px] text-[var(--esg-text2,rgba(255,255,255,0.56))]">
            {skippedFiles.slice(0, 6).join(", ")}
            {skippedFiles.length > 6 ? ` +${skippedFiles.length - 6} more` : ""}
          </p>
        </div>
      )}

      {/* The way ON from staging — kept at the TOP, directly under the drop
          zone. It used to sit below the element batches, which put the one
          button that advances the flow beneath a long grid: you staged files
          and then had to go hunting for how to continue. */}
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
            className="mt-3 flex flex-col gap-3 rounded-[18px] border border-[var(--esg-glass-border,rgba(255,255,255,0.07))] bg-[var(--esg-section-bg,#141416)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            data-testid="esg-read-bar"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--esg-text,#fff)]">{docs} ready to read</p>
              <p className="mt-0.5 text-[12px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]" data-testid="esg-read-bar-price">
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
                  className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-medium text-[var(--esg-text2,rgba(255,255,255,0.56))] transition-colors hover:text-white"
                  data-testid="esg-button-retry-quote-inline"
                >
                  Try again
                </button>
              )}
              <button
                type="button"
                disabled={quoting}
                onClick={() => setDoneStaging(true)}
                className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-medium text-[var(--esg-text2,rgba(255,255,255,0.56))] transition-colors hover:text-white disabled:opacity-50"
                data-testid="esg-button-done-staging"
              >
                See cost breakdown
              </button>
              {readUnaffordable && tokenCost ? (
                <a
                  href="/settings/billing"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7]"
                  data-testid="esg-button-add-tokens"
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
                  data-testid="esg-button-read-now"
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
          panel only renders once a quote exists — so when pricing fails the
          button appears to do nothing at all. Say what went wrong where the
          button was, and offer both ways forward. */}
      {doneStaging && !quote && !quoting && unreadFiles.length > 0 && (
        <div
          className="mt-3 flex flex-col gap-3 rounded-[18px] border border-amber-300/20 bg-[#1d1a14] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
          data-testid="esg-quote-unavailable"
          role="alert"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-amber-100">
              We could not work out the cost of these {files.length} document
              {files.length === 1 ? "" : "s"}
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
              className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-medium text-[var(--esg-text2,rgba(255,255,255,0.56))] transition-colors hover:text-white"
              data-testid="esg-button-back-to-staging"
            >
              Back to adding
            </button>
            <button
              type="button"
              onClick={() => void prepareAndQuote(files)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7]"
              data-testid="esg-button-retry-quote"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* The upload surface itself, one batch per ESG element plus the whole-file
          uploads. Gated on `parserCase`, NOT on `quote`: a quote arrives the
          moment the first batch lands, and gating on it would tear the uploader
          off the screen mid-task. Extraction is the point of no return, so that
          is what closes the uploader. */}
      {!parserCase && !(focused && files.length === 0 && !quote) && (
        <div className="mt-3">
          <EsgElementDocumentBatches
            satisfiedDocumentIds={satisfiedDocumentIds}
            filedBatchByFile={filedBatchByFile}
            stagedFileNames={files.map((f) => f.name)}
            onPick={handleBatchPick}
            disabled={parsing}
          />
        </div>
      )}

      {/* Double-check before anything is staged. Reused verbatim from the
          B-BBEE flow — it is about files and money, not about a domain. */}
      <ConfirmUploadDialog
        pending={pendingUpload}
        onConfirm={confirmPendingUpload}
        onCancel={() => setPendingUpload(null)}
      />

      {/* Phase banner — names where we are so the multi-minute paid wait shows
          movement rather than a frozen spinner. */}
      {parsing && (
        <div
          ref={extractionPhaseRef}
          className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--esg-acc-e,#1de9a0)]/20 bg-[#101a16] px-4 py-3"
          data-testid="esg-extraction-phase"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--esg-acc-e,#1de9a0)]" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[#d8fff0]">
              {resolving ? "Reconciling across your documents" : "Reading your documents"}
            </div>
            <div className="text-[12px] text-[var(--esg-text2,rgba(255,255,255,0.56))]">
              {resolving
                ? resolveProgress
                  ? `Understanding document ${Math.min(resolveProgress.done + 1, resolveProgress.total)} of ${resolveProgress.total} — cross-checking sites, periods and figures across every file`
                  : "Cross-checking sites, periods and figures across every file"
                : `${readCount} of ${unreadFiles.length} read`}
            </div>
          </div>
          {resolving && resolveProgress && resolveProgress.total > 0 && (
            <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[var(--esg-acc-e,#1de9a0)] transition-all"
                style={{ width: `${Math.round((resolveProgress.done / resolveProgress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* The staged / scanning list. */}
      {files.length > 0 && !quoteReady && (
        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--esg-glass-border,rgba(255,255,255,0.07))] bg-[var(--esg-input-bg,#0e0e10)]">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_110px_120px_36px] gap-3 border-b border-white/[0.06] px-3.5 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--esg-text3,rgba(255,255,255,0.32))] sm:grid">
            <span>File</span>
            <span>Status</span>
            <span>Type</span>
            <span />
          </div>
          {files.map((f, i) => {
            const outcome = readOutcomeByFile[f.name];
            const quotedFile = quoted(f.name);
            const fileType = quotedFile?.requiresOcr
              ? "Scan"
              : quotedFile
                ? "Digital"
                : (f.name.split(".").pop()?.toUpperCase() ?? "File");
            const perFile = docProgress[f.name];
            const isReadingThis = perFile === "parsing";
            const alreadyRead = !isUnread(f);
            // A round reads only the new files; the ones already read keep their verdict.
            const statusLabel = parsing && !alreadyRead
              ? perFile === "done"
                ? "Read"
                : perFile === "error"
                  ? "Failed"
                  : isReadingThis
                    ? "Reading"
                    : resolving
                      ? "Read"
                      : "Queued"
              : perFile === "error"
                ? "Failed"
                : outcome === "values"
                  ? "Read"
                  : outcome === "none"
                    ? "Nothing read"
                    : quotedFile
                      ? "Not read yet"
                      : quoting
                        ? "Pricing"
                        : "Queued";
            return (
              <div
                key={f.name}
                className="esg-fade-up relative overflow-hidden border-b border-white/[0.05] px-3.5 py-3 last:border-b-0"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_110px_120px_36px] sm:items-center sm:gap-3">
                  {isReadingThis && (
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 w-1/3"
                      style={{
                        background:
                          "linear-gradient(100deg, transparent, rgba(29,233,160,0.09), transparent)",
                        animation: "esgShimmer 1.4s ease-in-out infinite",
                      }}
                    />
                  )}
                  <div className="flex min-w-0 items-center gap-2 text-left">
                    <FileText className="h-4 w-4 shrink-0 text-[var(--esg-text3,rgba(255,255,255,0.32))]" />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-[#e5e5ea]">{f.name}</div>
                      {/* Where the user filed it, and how big it is. What it
                          eventually counts as is the classifier's call. */}
                      {(quotedFile || filedBatchByFile[f.name]) && (
                        <div className="mt-0.5 truncate text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
                          {filedBatchByFile[f.name] ? esgBatchLabel(filedBatchByFile[f.name]) : null}
                          {filedBatchByFile[f.name] && quotedFile ? " · " : null}
                          {quotedFile ? fileUnits(quotedFile) : null}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/[0.04] px-2 py-1 text-[11px] text-[color:var(--body)]">
                    {isReadingThis && <Loader2 className="h-3 w-3 animate-spin" />}
                    {perFile === "done" && parsing && <Check className="h-3 w-3 text-emerald-400" />}
                    {perFile === "error" && <AlertTriangle className="h-3 w-3 text-red-400" />}
                    {statusLabel}
                  </span>
                  <span className="text-[12px] text-[var(--esg-text2,rgba(255,255,255,0.56))]">{fileType}</span>
                  {/* A read document is part of the workbook now — no remove. */}
                  {alreadyRead ? (
                    <span />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(f.name);
                      }}
                      disabled={parsing}
                      className="justify-self-start p-1 text-[color:var(--muted)] transition-colors hover:text-[var(--esg-text2,rgba(255,255,255,0.56))] disabled:opacity-30 sm:justify-self-end"
                      aria-label={`Remove ${f.name}`}
                      data-testid={`esg-remove-${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Documents the parser failed on. Named individually so the user replaces
          the one file rather than re-uploading everything. */}
      {failedDocuments.length > 0 && !parsing && (
        <div
          className="mt-3 rounded-2xl border border-red-400/25 bg-red-500/[0.06] p-4"
          data-testid="esg-failed-documents"
          role="alert"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-red-200">
            <AlertTriangle className="h-4 w-4" />
            {failedDocuments.length} document{failedDocuments.length === 1 ? "" : "s"} could not be
            read
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]">
            Everything else was read normally. These produced nothing, so nothing from them has been
            used: {failedDocuments.slice(0, 5).join(", ")}
            {failedDocuments.length > 5 ? ` +${failedDocuments.length - 5} more` : ""}.
          </p>
        </div>
      )}

      {parseError && (
        <p className="mt-3 text-[12px] text-red-400" role="alert" data-testid="esg-parse-error">
          {parseError}
        </p>
      )}
      {libraryWarning && (
        <p className="mt-3 text-[12px] text-amber-300" role="alert" data-testid="esg-library-warning">
          {libraryWarning}
        </p>
      )}
      {refundNotice && (
        <p
          className="mt-3 text-[12px] text-[var(--esg-acc-e,#1de9a0)]"
          role="status"
          data-testid="esg-refund-notice"
        >
          {refundNotice}
        </p>
      )}

      {quoting && (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-[var(--esg-text2,rgba(255,255,255,0.56))]" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--esg-acc-e,#1de9a0)]" />
          Checking size and format to price these documents — nothing is read yet.
        </p>
      )}

      {/* ACT 3 — the reveal. */}
      {revealed && (
        <div className="mt-4">
          <EsgExtractionSummary injection={injection} parserCase={parserCase} />

          <div className="esg-fade-up mt-4" style={{ animationDelay: "200ms" }}>
            <button
              onClick={() =>
                void onComplete({
                  injection,
                  parserCase,
                  documentIds: Array.from(new Set(persistedDocumentsRef.current.values())),
                })
              }
              // A document added after the read but never read would arrive with
              // nothing taken from it — read it or remove it first.
              disabled={busy || unreadFiles.length > 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold transition-all duration-200 disabled:opacity-40"
              style={{ background: "var(--esg-acc-e, #1de9a0)", color: "#080e14" }}
              data-testid="esg-button-continue-to-workbook"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Leaf className="h-4 w-4" />}
              {injection.implemented && injection.placed.length > 0
                ? `Open the workbook with ${injection.placed.length} value${injection.placed.length === 1 ? "" : "s"} filled in`
                : "Continue to the workbook"}
            </button>
            {unreadFiles.length > 0 && (
              <p className="mt-2 text-center text-[11.5px] leading-5 text-amber-300/90" data-testid="esg-unread-hint">
                {unreadFiles.length} document{unreadFiles.length === 1 ? " you added has" : "s you added have"} not been
                read yet — read {unreadFiles.length === 1 ? "it" : "them"} above, or remove{" "}
                {unreadFiles.length === 1 ? "it" : "them"}, before continuing.
              </p>
            )}
            <p className="mt-2 text-center text-[11px] text-[color:var(--muted)]">
              {injection.implemented && injection.placed.length > 0
                ? "You’ll land in a pre-filled workbook — review, complete anything missing, then continue to Summary."
                : "Nothing has been written into the workbook. You’ll land there to complete it, and your documents stay in your library."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default EsgDocumentUploadStart;
