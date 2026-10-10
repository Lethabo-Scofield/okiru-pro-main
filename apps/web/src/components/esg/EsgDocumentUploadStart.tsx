/**
 * Document-upload start for the ESG workbook — the ESG sibling of
 * `scorecard/DocumentUploadStart`.
 *
 * Same steps, same lifecycle, same guarantees — and the same shared parts
 * (components/upload/flow), one main button per step:
 *   1. Add — a drop zone, with the per-element checklist folded away under it.
 *   2. Read — a free structure-only quote in the read bar, then (once tokens
 *      are authorised) the paid read, streamed per document over SSE and shown
 *      as one status line.
 *   3. Continue — one summary line with Continue beside it, above the review of
 *      what was read, what was placed, and what was not.
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
import { AlertTriangle, ArrowRight, ChevronLeft, Loader2 } from "lucide-react";
import { UploadSurface } from "@/components/upload/flow/UploadSurface";
import { ReadBar, type ReadBarState } from "@/components/upload/flow/ReadBar";
import { CostDetails } from "@/components/upload/flow/CostDetails";
import { DocumentList, type DocumentListRow, type DocumentStatus } from "@/components/upload/flow/DocumentList";
import { StatusLine } from "@/components/upload/flow/StatusLine";
import { Disclosure } from "@/components/upload/flow/Disclosure";
import { primaryButton } from "@/components/upload/flow/buttonStyles";
import { sortPickedFiles, temporarySentence, unreadableSentence } from "@/components/upload/flow/readableFiles";
import { fileUnits, type TokenCost } from "@/components/upload/flow/tokenCost";
import ConfirmUploadDialog, { type PendingUpload } from "@/components/scorecard/ConfirmUploadDialog";
import EsgElementDocumentBatches, {
  esgBatchLabel,
  esgFocusElements,
  type EsgUploadOrigin,
} from "./EsgElementDocumentBatches";
import EsgExtractionSummary from "./EsgExtractionSummary";
import type { EsgWorkbookAxisState } from "@/lib/esg/esgCaseAxes";
import { DocumentReview } from "@/components/review/DocumentReview";
import { buildEsgDocumentReview } from "./esgDocumentReview";
import {
  applyEsgParserResult,
  esgCaseFileNames,
  esgChoiceCell,
  esgUploadNameForSource,
  mergeEsgCalculators,
  restrictEsgInjection,
  withEsgManualPlacement,
  type EsgInjectionResult,
  type EsgParserCaseLike,
} from "./esgParserInjection";
import { clearEsgPendingRead, readEsgPendingRead, writeEsgFlowSnapshot, writeEsgPendingRead } from "./esgFlowSnapshot";
import {
  PaidReadInterrupted,
  RESUME_CHECKING_MESSAGE,
  RESUME_RUNNING_MESSAGE,
  collectPaidRead,
  isConnectionLoss,
  refundSentence,
  uncollectedReadMessage,
} from "@/lib/paidReadResume";
import { postParserRun, signedRunsByFile, withoutSignedRuns } from "@/lib/parserRunAttestation";
import type { EsgUploadFocus } from "@/lib/esg/esgSectionElements";
import { esgSectionById } from "@/lib/esg/esgSections";

/** One upload a read covers: the File while this page holds it, its library id once saved. */
interface ReadUpload {
  name: string;
  file: File | null;
  documentId: string | null;
}

/** How a paid read ended: its result landed, it was refused or broke, or its connection dropped and it could not be collected. */
type ReadEnd = "delivered" | "failed" | "lost";

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

// What a batch costs in credit tokens (TokenCost), and which files the parser
// can open, are shared with the B-BBEE flow: components/upload/flow.

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
      // The workbook is filled from the calculator: spread with the rest, the
      // new round's replaced the earlier one and round one's values vanished.
      calculator: mergeEsgCalculators(kept.ai_entities?.calculator, fresh.ai_entities?.calculator, freshFiles),
    },
  };
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
  /**
   * The workbook these documents fill: the sites and reporting months it states,
   * and whether it already holds monthly figures (then its axes stay). Absent
   * for a company being created — its axes come from its own documents.
   */
  workbookAxes?: EsgWorkbookAxisState | null;
  /**
   * Documents added from inside one workbook section (C1): read for that
   * section's elements and written only to its pillar's sections. Absent — the
   * whole workbook — everything goes where it belongs.
   */
  focus?: EsgUploadFocus | null;
}

export function EsgDocumentUploadStart({
  companyId,
  companyName,
  focused = false,
  onComplete,
  busy = false,
  onBack,
  initialFiles,
  workbookAxes = null,
  focus = null,
}: EsgDocumentUploadStartProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [libraryWarning, setLibraryWarning] = useState<string | null>(null);
  /** What the server refunded for the run that just ended, in its own words. */
  const [refundNotice, setRefundNotice] = useState<string | null>(null);
  /** Set while a dropped read is being collected and the server says it is still reading. */
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  /** A dropped read that could not be collected: what happened, whether the tokens come back, and a way on. */
  const [readLost, setReadLost] = useState<{ message: string; quoteId: string; canCheckAgain: boolean } | null>(null);
  /** A read collected after a reload: its uploads are only in the library, so the reveal runs on the case alone. */
  const [collectedWithoutFiles, setCollectedWithoutFiles] = useState(false);
  /** Library id per name for uploads a collected read covered without their File. */
  const collectedIdsByNameRef = useRef<Record<string, string>>({});
  /** Polling for a dropped read stops when the page goes. */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [parserCase, setParserCase] = useState<EsgParserCaseLike | null>(null);
  const persistedDocumentsRef = useRef<Map<string, string>>(new Map());
  /** The phase banner reporting the paid read — scrolled to when it starts. */
  const extractionPhaseRef = useRef<HTMLDivElement | null>(null);
  /** Per-file extraction progress, keyed by the file's name. */
  const [docProgress, setDocProgress] = useState<Record<string, "parsing" | "done" | "error">>({});
  /** True once every file is read and the cross-document resolve is running. */
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState<{ done: number; total: number } | null>(null);

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
  /** Which batch each staged file was filed under — sent to the reader as a hint (C1). */
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
  /** Office lock files set aside from the last pick — a notice, not an error. */
  const [temporaryNotice, setTemporaryNotice] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  /** Monotonic id so only the latest quote request writes state (race guard). */
  const quoteSeqRef = useRef(0);
  /** Aborts any in-flight quote when a newer one starts. */
  const quoteAbortRef = useRef<AbortController | null>(null);
  /** Bumped outside runQuote (file cap, file removal) to invalidate a quote. */
  const quoteRequestRef = useRef(0);

  /**
   * Keep a paid read alive across navigation — for the create flow only, the
   * one place that restores it (`esgFlowSnapshot`). Inside an existing
   * company's workbook the read lands in that workbook; a snapshot there was
   * offered back by the Hub and the create flow as a NEW company built from
   * the other company's documents.
   */
  const saveCreateFlowSnapshot = (caseResult: EsgParserCaseLike, result: EsgInjectionResult) => {
    if (companyId) return;
    writeEsgFlowSnapshot({
      savedAt: new Date().toISOString(),
      entityName: "",
      nameSource: "none",
      work: {
        route: "documents",
        patches: result.patches,
        injection: result,
        parserCase: caseResult,
        documentIds: allDocumentIds(),
        excel: null,
      },
    });
  };
  /** Kept to the focus section's pillar when documents are added from inside a section (C1). */
  const withinFocus = (result: EsgInjectionResult): EsgInjectionResult =>
    focus ? restrictEsgInjection(result, new Set(focus.sections), (id) => esgSectionById(id)?.title ?? id) : result;
  /** The injection for a case, as this upload writes it. */
  const injectFor = (caseResult: EsgParserCaseLike | null): EsgInjectionResult =>
    withinFocus(applyEsgParserResult(caseResult, { workbook: workbookAxes }));
  /**
   * The mapping seam. While `applyEsgParserResult` is a stub this reports every
   * extracted value as unplaced and writes nothing — see `esgParserInjection`.
   */
  const injection = useMemo<EsgInjectionResult>(
    () => injectFor(parserCase),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- injectFor reads exactly these
    [parserCase, workbookAxes, focus],
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

  /** Every library id this flow owns: this mount's uploads, and any a collected read covered. */
  const allDocumentIds = () =>
    Array.from(
      new Set([
        ...Array.from(persistedDocumentsRef.current.values()),
        ...Object.values(collectedIdsByNameRef.current),
      ]),
    );

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
    uploads: ReadUpload[],
    docErrors: Map<string, string>,
  ): Promise<void> => {
    const extractions = data.ai_entities?.extractions ?? [];
    const reviewRows = data.documents_needing_review ?? [];
    const signed = signedRunsByFile(data);
    const fileNames = Array.from(new Set([...esgCaseFileNames(data), ...Array.from(signed?.keys() ?? [])]));
    if (fileNames.length === 0) return;

    // A workbook comes back as one source per sheet ("File.xlsx › Sheet"); its
    // run belongs to the file that was uploaded, carrying every sheet.
    const uploadNames = uploads.map((candidate) => candidate.name);
    const uploadOf = (source: unknown) => esgUploadNameForSource(source, uploadNames);
    const problems = [
      ...(data.unreadable_files ?? []).map((u) => [String(u.file_name ?? ""), String(u.reason ?? "")] as const),
      ...Array.from(docErrors.entries()),
    ];
    const filesInCase = Array.from(
      new Set(fileNames.map(uploadOf).filter((name): name is string => Boolean(name))),
    );

    const tasks = filesInCase.map(async (filename) => {
      const upload = uploads.find((candidate) => candidate.name === filename);
      if (!upload) return;
      const documentId = await documentIdOf(upload);
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
      // The parser's signed record is what the library stores: it carries a
      // status and every value read, with its sheet and citation, as the AI
      // block. The record built here (no status — every api refused it) is
      // sent only when the parser signed nothing, so the refusal is reported
      // as before rather than the file silently left out.
      const own = signed?.get(filename);
      await postParserRun(documentId, filename, own
        ? { signed: own }
        : { legacy: { parserOutput, caseId: data.case_id ?? null, reviewReasons } });
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
   * Finish a read exactly as a completed stream does: file the signed runs in
   * the library, merge into the case, mark the files read and keep the
   * snapshot. One path for a stream that delivered and for a read collected
   * after its connection dropped, so the two can never end differently.
   */
  const completeRead = async (
    data: EsgParserCaseLike,
    uploads: ReadUpload[],
    docErrors: Map<string, string>,
  ): Promise<void> => {
    // Uploads that are only in the library (a read collected after a reload)
    // still belong to this flow: the workbook files them under the company.
    for (const upload of uploads) {
      if (!upload.file && upload.documentId) {
        collectedIdsByNameRef.current = { ...collectedIdsByNameRef.current, [upload.name]: upload.documentId };
      }
    }
    try {
      await persistParserRuns(data, uploads, docErrors);
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
    // The signed records were filed above; the case keeps no second copy.
    const mergedCase = mergeEsgCases(parserCaseRef.current, withoutSignedRuns(data));
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
    if (uploads.length > 0 && uploads.every((upload) => !upload.file)) setCollectedWithoutFiles(true);
    // Tokens have just been spent on this result — make it survive leaving
    // the flow, even before "continue to workbook" is pressed. The host flow
    // restores it (straight to review) on its next mount, and overwrites this
    // with the proposed entity name once the user does continue.
    // The backlog below measures the mapper, so it reads the unrestricted result: what a
    // section's focus (C1) holds back was placed fine, just not written from here.
    const mappedInjection = applyEsgParserResult(mergedCase, { workbook: workbookAxes });
    const snapshotInjection = withinFocus(mappedInjection);
    // The honest not-placed list IS the improvement backlog — record it
    // server-side (fire-and-forget) so "what should the mapper learn next?"
    // is answerable from data instead of memory. Never blocks the flow.
    try {
      const byKey = new Map<string, { field: string; context: string; reason: string; count: number }>();
      for (const u of mappedInjection.unplaced) {
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
            fileCount: uploads.length,
            valuesRead: mappedInjection.valuesRead,
            placedCount: mappedInjection.placed.length,
            unplacedCount: mappedInjection.unplaced.length,
            conflictCount: mappedInjection.conflicts.length,
            unplaced: Array.from(byKey.values()),
          }),
        }),
      ).catch(() => {});
    } catch {
      // telemetry must never cost a user their extraction
    }
    saveCreateFlowSnapshot(mergedCase, snapshotInjection);
    // The read has landed: nothing is left to collect.
    clearEsgPendingRead(companyId);
  };

  /**
   * Ask the server to settle the run that just ended. Whatever the run failed
   * to deliver is refunded there — decided from the parser's own record of the
   * run, never from anything this screen reports. Resolves the settlement
   * (null when it could not be asked).
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
  const collectRead = async (
    quoteId: string,
    uploads: ReadUpload[],
    docErrors: Map<string, string>,
  ): Promise<ReadEnd> => {
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
      await completeRead(collected.result as EsgParserCaseLike, uploads, docErrors);
      return "delivered";
    }
    // Unreachable: the read may still land — keep the record so "Check again"
    // or a reload can collect it. Anything else is final.
    if (collected.status !== "unreachable") clearEsgPendingRead(companyId);
    const settlement = await requestSettlement(quoteId);
    if (settlement?.state === "settled" && Number(settlement.refundedTokens) > 0) {
      if (typeof settlement.balance === "number") {
        setTokenCost((prev) => (prev ? { ...prev, balance: settlement.balance } : prev));
      }
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
      return await collectRead(quoteId, uploads, new Map());
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not collect the read");
      return "failed";
    } finally {
      setParsing(false);
      setResolving(false);
    }
  };

  /**
   * The paid work. Only runs once the quote is authorised, and sends the quote
   * id so the server can verify payment and that these are the exact files that
   * were paid for. A dropped connection — or a stream gone quiet — is not the
   * end of the read: the run carries on server-side and its result is
   * collected instead.
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
    /**
     * Per-file failures reported live on the stream. They do NOT appear in
     * the streaming result payload (only the non-streaming route carries
     * `unreadable_files`), so this is the only record of them — and it has to
     * reach the run archive, or a document that failed looks identical to one
     * that was never uploaded.
     */
    const docErrors = new Map<string, string>();

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
    /** A lost stream — dropped, or silent past the idle limit — is collected rather than failed. */
    const lostStream = (err: unknown) => isConnectionLoss(err) || timedOut;

    try {
      await persistSelectedDocuments(list);
      // The read in flight, kept until it lands: what a retry or a reload
      // collects if this connection drops.
      writeEsgPendingRead({
        quoteId,
        startedAt: new Date().toISOString(),
        fileNames: list.map((f) => f.name),
        documentIdsByName: Object.fromEntries(
          uploadsOf(list).flatMap((u) => (u.documentId ? [[u.name, u.documentId]] : [])),
        ),
      }, companyId);
      const form = new FormData();
      for (const f of list) form.append("files", f, f.name);
      form.append("case_id", `esg_workbook_${companyId || "unknown"}_${Date.now()}`);
      form.append("quote_id", quoteId);
      if (companyId) form.append("company_id", companyId);
      // The element batch each file was filed under (C1): a hint the reader
      // uses where its own classifier is unsure. Added from inside a section
      // with a single element, every unfiled file carries that element.
      const soleElement = focus && focus.elements.length === 1 ? focus.elements[0] : null;
      const filed = soleElement
        ? Object.fromEntries(list.map((f) => [f.name, filedBatchByFile[f.name] ?? soleElement]))
        : filedBatchByFile;
      const focusElements = esgFocusElements(list.map((f) => f.name), filed);
      if (Object.keys(focusElements).length > 0) form.append("focus_elements", JSON.stringify(focusElements));

      resetIdleTimer();
      // Streaming endpoint: emits per-file doc-start/doc-done SSE events so the
      // list fills up as each document is read, then a single result event.
      let res: Response;
      try {
        res = await fetch("/api/parser/esg/resolve-case-files-stream", {
          method: "POST",
          credentials: "include",
          body: form,
          signal: controller.signal,
        });
      } catch (err) {
        if (lostStream(err)) throw new PaidReadInterrupted(quoteId, timedOut ? "idle" : "connection");
        throw err;
      }
      if (res.status === 402 || res.status === 409 || res.status === 410) {
        const body = await res.json().catch(() => ({}));
        // Spent by a run already going (a double click, a retry): collect it.
        if (res.status === 409 && body?.error?.code === "QUOTE_ALREADY_USED") {
          throw new PaidReadInterrupted(quoteId, "already-used");
        }
        clearEsgPendingRead(companyId);
        throw new Error(body?.error?.message ?? "Payment could not be verified for these documents");
      }
      if (!res.ok || !res.body) throw new Error(`Parser returned ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let data: EsgParserCaseLike | null = null;
      let streamError: string | null = null;

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
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (lostStream(err)) throw new PaidReadInterrupted(quoteId, timedOut ? "idle" : "connection");
          throw err;
        }
        const { done, value } = chunk;
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
      if (idleTimer) clearTimeout(idleTimer);

      if (streamError) {
        clearEsgPendingRead(companyId);
        throw new Error(streamError);
      }
      // The stream closed without a result or an error: cut on the way (a
      // proxy timeout, a dropped hop). The run may well have finished.
      if (!data) throw new PaidReadInterrupted(quoteId, "no-result");
      await completeRead(data, uploadsOf(list), docErrors);
      end = "delivered";
    } catch (err) {
      if (idleTimer) clearTimeout(idleTimer);
      if (err instanceof PaidReadInterrupted) {
        try {
          end = await collectRead(err.quoteId, uploadsOf(list, readEsgPendingRead(companyId)?.documentIdsByName), docErrors);
        } catch (collectError) {
          setParseError(collectError instanceof Error ? collectError.message : "Could not collect the read");
        }
      } else {
        setParseError(err instanceof Error ? err.message : "Could not read the documents");
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      setParsing(false);
      setResolving(false);
    }
    return end;
  };

  /**
   * Settle the run that just ended and show what came back, so a refund shows
   * the moment it happens. A read that was lost settled itself already, with
   * its own message.
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
  };

  /**
   * A read whose connection dropped before this page mounted (a reload, a
   * closed tab) is collected on the way in — once, on mount, before any
   * interaction.
   */
  useEffect(() => {
    const pending = readEsgPendingRead(companyId);
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
   * Spend tokens, then read.
   *
   * The debit is server-side and idempotent, so a double-click charges once. If
   * the balance will not cover the batch we say so with the exact shortfall and
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
        const pending = readEsgPendingRead(companyId);
        const end = await resumeCollect(
          quote.quoteId,
          uploadsOf(unreadFiles, pending?.quoteId === quote.quoteId ? pending.documentIdsByName : {}),
        );
        await settlePaidRun(quote.quoteId, end);
        return;
      }
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
    const pending = readEsgPendingRead(companyId);
    const uploads = unreadFiles.length > 0
      ? uploadsOf(unreadFiles, pending?.documentIdsByName)
      : (pending?.fileNames ?? []).map((name) => ({ name, file: null, documentId: pending?.documentIdsByName[name] ?? null }));
    void resumeCollect(lost.quoteId, uploads).then((end) => settlePaidRun(lost.quoteId, end));
  };
  const uploadLostReadAgain = () => {
    setReadLost(null);
    clearEsgPendingRead(companyId);
    if (unreadFiles.length > 0) void prepareAndQuote(files);
  };

  /**
   * Whole-folder upload. A folder carries everything — including desktop.ini,
   * thumbnails and whatever else lives alongside the evidence. Take what we can
   * read, say plainly what was skipped, and let the user decide.
   */
  const addFolder = (incoming: File[], origin?: EsgUploadOrigin) => addFiles(incoming, origin);

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
    // One rule for every way in — a dragged folder, a dragged file, a picked
    // file, a checklist group (see readableFiles): OS bookkeeping is dropped
    // silently, Office lock files get one neutral line, and anything the
    // parser cannot open is named before anything is priced. The pickers no
    // longer filter, so this is the only place a file is set aside.
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

  // A read collected after a reload has no File objects, only the case.
  const revealed = Boolean(parserCase && !parsing && (files.length > 0 || collectedWithoutFiles));
  /** Whether reading the unread files spends tokens (the read bar works out whether the balance covers it). */
  const readCharging = Boolean(quote && quote.paymentRequired !== false && tokenCost !== null);
  /** One click from the bar under the uploader — the breakdown stays one click away. */
  const readNow = () => {
    if (!quote) return;
    if (readCharging) void spendAndExtract();
    else void readFree(unreadFiles, quote.quoteId);
  };

  const readCount = Object.values(docProgress).filter((s) => s === "done").length;
  const failedDocuments = Object.entries(docProgress)
    .filter(([, status]) => status === "error")
    .map(([name]) => name);

  /**
   * The side-by-side review: one entry per uploaded file — what we took from
   * it, what we read but could not place, and why anything was not read. The
   * lists the summary used to carry now sit beside the document they are about.
   */
  const reviewDocuments = useMemo(
    () =>
      parserCase
        ? buildEsgDocumentReview({
            parserCase,
            injection,
            uploadNames: files.map((f) => f.name),
            failedFiles: failedDocuments,
          })
        : [],
    // failedDocuments is derived from docProgress on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parserCase, injection, files, docProgress],
  );
  const documentIdFor = (name: string): string | null => {
    const file = files.find((f) => f.name === name);
    return file
      ? persistedDocumentsRef.current.get(filePersistenceKey(file)) ?? null
      : collectedIdsByNameRef.current[name] ?? null;
  };

  /**
   * "Put it here": a held figure placed where the person says — its site,
   * its month — or, with no answer, taken back. Kept on the case, so it
   * survives leaving the flow and reaches the workbook with everything else.
   */
  const answerPlacement = (choiceId: string, answer: Record<string, string> | null) => {
    const current = parserCaseRef.current;
    if (!current) return;
    let next: EsgParserCaseLike;
    if (!answer) {
      next = withEsgManualPlacement(current, choiceId, null);
    } else {
      const choice = injection.unplaced.find((u) => u.choice?.id === choiceId)?.choice;
      if (!choice) return;
      const siteRow = answer.site !== undefined ? Number(answer.site) : choice.siteRow;
      const cell = esgChoiceCell(choice, { siteRow, month: answer.month });
      if (!cell) return;
      const axes = injection.axes;
      const month = answer.month ?? choice.month;
      const monthLabel = month && axes ? axes.months[month.charCodeAt(0) - 67] : undefined;
      // A cell the documents already filled is replaced — said, so it can be undone.
      const held = injection.patches[cell.sectionId]?.cells[cell.cellRef];
      const where = [
        siteRow !== undefined && choice.needs.includes("site") ? axes?.depots[siteRow] : undefined,
        monthLabel,
      ].filter(Boolean).join(", ");
      next = withEsgManualPlacement(current, choiceId, {
        ...cell,
        value: choice.value,
        where: typeof held === "number"
          ? `${where} (replacing ${new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 2 }).format(held)} from the documents)`
          : where,
      });
    }
    parserCaseRef.current = next;
    setParserCase(next);
    saveCreateFlowSnapshot(next, injectFor(next));
  };

  // ── What is on screen ────────────────────────────────────────────────────
  // The same steps as the B-BBEE flow, built from the same parts: Upload files
  // (empty), Read N documents (staged), one status line (reading), and the
  // summary with Continue ABOVE the review once read.
  const readBarState: ReadBarState = quoting ? "pricing" : quote ? "priced" : "failed";
  const showReadBar = unreadFiles.length > 0 && !parsing;
  /** A pricing failure is said in the read bar, so it is not said again below. */
  const pricingFailedInBar = showReadBar && readBarState === "failed";
  /** The checklist: before the first read only, never while reading. */
  const showChecklist = !parserCase && !parsing && !(focused && files.length === 0 && !quote);

  /** One row of the file list: a name, one status word and its own action. */
  const rowFor = (f: File): DocumentListRow => {
    const outcome = readOutcomeByFile[f.name];
    const quotedFile = quoted(f.name);
    const perFile = docProgress[f.name];
    const alreadyRead = !isUnread(f);
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
          : outcome === "values"
            ? "read"
            : outcome === "none"
              ? "needs-look"
              : "ready";
    return {
      name: f.name,
      status,
      details: [
        filedBatchByFile[f.name] ? `Added to ${esgBatchLabel(filedBatchByFile[f.name])}` : "",
        quotedFile ? fileUnits(quotedFile) : "",
        quotedFile?.requiresOcr ? "scanned" : "",
        outcome === "none" ? "nothing was read from it" : "",
      ].filter(Boolean),
      error:
        status === "failed"
          ? parsing
            ? "We couldn't read this file. The rest carry on."
            : "We couldn't read this file. Replace it with a clearer copy, or remove it."
          : null,
      removable: !alreadyRead,
    };
  };
  const listFiles = revealed ? unreadFiles : files;
  const willFill = injection.implemented && injection.placed.length > 0;

  const readBar = showReadBar ? (
    <ReadBar
      testIdPrefix="esg-"
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
          testIdPrefix="esg-"
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
        testIdPrefix="esg-"
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
        <div className="mt-2 text-[12px] leading-5" data-testid="esg-skipped-files-warning">
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
        <p className="mt-2 text-[12px] leading-5 text-[color:var(--body)]" data-testid="esg-skipped-temporary-files">
          {temporaryNotice}
        </p>
      )}
    </>
  );

  return (
    <div data-testid="esg-document-upload-start">
      <div className="mb-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 rounded-md text-[12px] font-medium text-[color:var(--body)] transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            data-testid="esg-upload-back"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Choose a different way to start
          </button>
        )}
        {/* Document scale, left aligned, matching the B-BBEE step exactly. The
            evidence types are listed once, in the drop zone, not here too. */}
        <h3 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-white">
          {parserCase ? "Your ESG evidence" : "Add your ESG evidence"}
        </h3>
        <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--body)]">
          {parserCase
            ? "Read and placed. Check anything marked, then continue."
            : "We'll show the cost before anything is read."}
        </p>
        {focus ? (
          // Added from inside one section (C1): say what that means before anything is read.
          <p
            className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[12px] leading-5 text-[color:var(--body)]"
            data-testid="esg-upload-focus"
          >
            Adding documents to <span className="font-semibold text-white">{focus.title}</span>. Figures
            are written to{" "}
            {focus.sections.length > 1
              ? focus.sections.map((id) => esgSectionById(id)?.title ?? id).join(", ")
              : "this section"}{" "}
            only; anything that belongs elsewhere is kept with its document and listed, not written.
          </p>
        ) : null}
      </div>

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

      {parsing ? (
        // While reading: one calm line; the files are behind "Show documents".
        <StatusLine
          testIdPrefix="esg-"
          containerRef={extractionPhaseRef}
          total={unreadFiles.length}
          done={readCount}
          failed={failedDocuments.length}
          checking={resolving}
          checkProgress={resolveProgress}
          notice={resumeNotice}
        >
          {unreadFiles.length > 0 ? (
            <DocumentList testIdPrefix="esg-" rows={unreadFiles.map(rowFor)} onRemove={removeFile} locked />
          ) : null}
        </StatusLine>
      ) : revealed ? (
        // A round after a read: the new documents and the bar that reads them.
        <>
          {readBar}
          {fileList}
          {pickNotices}
          {unreadFiles.length > 0 && (
            <div className="mt-3">
              <UploadSurface
                testIdPrefix="esg-"
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
            testIdPrefix="esg-"
            staged={files.length > 0}
            lead="Utility bills, fuel statements, waste manifests, registers, or anything else you have."
            onPickFiles={() => inputRef.current?.click()}
            onPickFolder={() => folderInputRef.current?.click()}
            onDropFiles={(dropped) => addFiles(dropped)}
          />
          {readBar}
          {fileList}
          {pickNotices}
        </>
      )}

      {parseError && !pricingFailedInBar && !parsing && (
        <p className="mt-3 text-[12px] leading-5 text-red-300" role="alert" data-testid="esg-parse-error">
          {parseError}
        </p>
      )}
      {/* A read whose connection dropped and could not be collected: what
          happened, whether the tokens come back, and a way on. */}
      {readLost && !parsing && (
        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-500/[0.06] px-4 py-3" role="alert" data-testid="esg-read-lost">
          <p className="text-[12px] leading-5 text-amber-100">{readLost.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {readLost.canCheckAgain && (
              <button
                type="button"
                onClick={checkLostReadAgain}
                className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--body)] hover:bg-white/[0.04]"
                data-testid="esg-button-read-check-again"
              >
                Check again
              </button>
            )}
            <button
              type="button"
              onClick={uploadLostReadAgain}
              className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--body)] hover:bg-white/[0.04]"
              data-testid="esg-button-read-upload-again"
            >
              Upload the documents again
            </button>
          </div>
        </div>
      )}
      {libraryWarning && (
        <p className="mt-3 text-[12px] leading-5 text-[color:var(--body)]" role="status" data-testid="esg-library-warning">
          {libraryWarning}
        </p>
      )}
      {refundNotice && (
        <p className="mt-3 text-[12px] leading-5 text-emerald-200/90" role="status" data-testid="esg-refund-notice">
          {refundNotice}
        </p>
      )}

      {/* The checklist, closed under the drop zone, before the first read. The
          group a file is added to travels to the reader as a hint (C1). */}
      {showChecklist && (
        <EsgElementDocumentBatches
          satisfiedDocumentIds={satisfiedDocumentIds}
          filedBatchByFile={filedBatchByFile}
          stagedFileNames={files.map((f) => f.name)}
          onPick={handleBatchPick}
          disabled={parsing}
        />
      )}

      {/* Double-check before anything from a checklist group is staged. Shared
          with the B-BBEE flow — it is about files and money, not a domain. */}
      <ConfirmUploadDialog
        pending={pendingUpload}
        onConfirm={confirmPendingUpload}
        onCancel={() => setPendingUpload(null)}
      />

      {/* After the read: one summary line with Continue beside it, ABOVE the
          review — the main button used to sit below a 780px panel, out of view. */}
      {revealed && (
        <div className="mt-4">
          <EsgExtractionSummary
            injection={injection}
            parserCase={parserCase}
            compact
            notice={
              failedDocuments.length > 0 ? (
                <p className="text-[12px] leading-5 text-red-200" role="alert" data-testid="esg-failed-documents">
                  {failedDocuments.length} document{failedDocuments.length === 1 ? "" : "s"} couldn&apos;t be read (
                  {failedDocuments.slice(0, 3).join(", ")}
                  {failedDocuments.length > 3 ? ` +${failedDocuments.length - 3} more` : ""}). See{" "}
                  {failedDocuments.length === 1 ? "it" : "them"} under Not read below.
                </p>
              ) : null
            }
            action={
              <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
                <button
                  type="button"
                  onClick={() =>
                    void onComplete({
                      injection,
                      parserCase,
                      documentIds: allDocumentIds(),
                    })
                  }
                  // A document added after the read but never read would arrive
                  // with nothing taken from it — read it or remove it first.
                  disabled={busy || unreadFiles.length > 0}
                  className={primaryButton("esg")}
                  data-testid="esg-button-continue-to-workbook"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
                  Continue
                </button>
                <p className="text-[11px] leading-5 text-[color:var(--muted)] sm:text-right">
                  {willFill ? "Opens a pre-filled workbook" : "Nothing was filled in. You'll complete the workbook yourself"}
                </p>
              </div>
            }
          />
          {unreadFiles.length > 0 && (
            <p className="mt-2 text-[11.5px] leading-5 text-amber-300/90" data-testid="esg-unread-hint">
              {unreadFiles.length} document{unreadFiles.length === 1 ? " you added has" : "s you added have"} not been
              read yet — read {unreadFiles.length === 1 ? "it" : "them"} above, or remove{" "}
              {unreadFiles.length === 1 ? "it" : "them"}, before continuing.
            </p>
          )}

          <DocumentReview
            documents={reviewDocuments}
            fileFor={(name) => files.find((f) => f.name === name) ?? null}
            documentIdFor={documentIdFor}
            onAddDocuments={() => inputRef.current?.click()}
            onAnswer={(_filename, question, answer) => answerPlacement(question.id, answer)}
          />
        </div>
      )}
    </div>
  );
}

export default EsgDocumentUploadStart;
