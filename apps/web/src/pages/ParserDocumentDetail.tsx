/**
 * One document, and everything we know about it.
 *
 * The library used to open a read-only summary: the fields that were read, the
 * ones that were not, and a short audit block. Everything the parser knew but
 * could not use — the classifications it nearly chose, the values it refused,
 * the raw text behind a normalised number — stayed in the run record where
 * nobody could see it. So a misread document was a dead end: you could tell
 * THAT it went wrong and never why, and there was nothing to do about it.
 *
 * This page is the other half. It shows what the parser missed, and it gives
 * the two things a person can do that the parser cannot do for itself:
 *
 *   SAY WHAT THE DOCUMENT IS. The classifier's runner-up candidates are
 *   offered as one-click corrections, each with the evidence that argued for
 *   it. A correction is recorded against the run, never over it — the original
 *   reading is the only evidence of what the classifier gets wrong.
 *
 *   GIVE IT A BETTER FILE. Re-read the same bytes, or replace them with a
 *   cleaner scan. Either way the result is appended as a new run, so a re-read
 *   that turns out worse can be compared instead of having silently replaced a
 *   better one.
 *
 * Plus the link to a saved company, which is what makes a document part of a
 * client's evidence rather than a loose file in a shared library.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { ReactNode } from "react";
import { AlertTriangle, Building2, Check, ChevronRight, CircleSlash, Download, FileWarning, Loader2, MapPin, RefreshCw, Upload } from "lucide-react";
import { ExtractionReviewPane } from "@/components/upload/ExtractionReviewPane";
import { EditableValue } from "@/components/review/EditableValue";
import type { PreviewFocus } from "@/components/review/DocumentPreview";
import { AiValuesSection, HowWeRead, LayerBadge, READER_WORDS, confidenceWord } from "@/components/review/AiValuesSection";
import { fieldLabel, formatParserValue, sheetOfSource, type ParserDocumentSummary, type ParserRunDetail, type ParserStatus } from "@/lib/parserDocuments";

/** One status word per document — the same five words the upload flow uses. */
const STATUS_WORD: Record<ParserStatus, { label: string; tone: string; icon: ReactNode }> = {
  passed: { label: "Read", tone: "text-[color:var(--body)]", icon: <Check className="h-3.5 w-3.5" aria-hidden /> },
  review_required: { label: "Needs a look", tone: "text-amber-300", icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> },
  failed: { label: "Couldn't read", tone: "text-red-300", icon: <CircleSlash className="h-3.5 w-3.5" aria-hidden /> },
};

/** A refusal reason as a sentence: "no_matching_option" → "No matching option". */
function plainReason(reason: string | undefined): string {
  const text = String(reason ?? "").replace(/[_]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "No reason was recorded";
}

interface ClientRow { clientId: string; name: string }

/** A classification the parser considered and did not choose. */
interface ClassificationCandidate {
  document_type?: string;
  pillar?: string;
  confidence?: number;
  matched_evidence?: string[];
  reasons?: string[];
}

/** "0:42", "3:05" — how long the read has been going. */
function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** One sentence for a value the reader was unsure of, by its label, not its key. */
function lowConfidenceSentence(key: string): string {
  return `Check ${fieldLabel(key)}. We were not sure we read it correctly.`;
}

/**
 * The parser words a doubtful value as "<raw_key> has low confidence". Say it
 * the way the low-confidence list says it, so the same doubt is listed once,
 * in plain words, rather than twice with the key showing.
 */
function plainWarning(message: string): string {
  const doubt = /^\s*([A-Za-z0-9_.]+) has low confidence\.?\s*$/i.exec(message);
  return doubt ? lowConfidenceSentence(doubt[1]) : message;
}

export default function ParserDocumentDetail({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const [document, setDocument] = useState<ParserDocumentSummary & { entityId?: string | null } | null>(null);
  const [run, setRun] = useState<ParserRunDetail | null>(null);
  const [runs, setRuns] = useState<ParserRunDetail[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [busy, setBusy] = useState<null | "type" | "company" | "reparse" | "review">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [typeDraft, setTypeDraft] = useState("");
  const replaceRef = useRef<HTMLInputElement>(null);
  /** The page or sheet the preview shows: the citation of the value being checked. */
  const [focus, setFocus] = useState<PreviewFocus | null>(null);
  /**
   * When the paid read started. A full read — rules, AI and agent — takes
   * minutes on a scanned pack; the page says so and counts, instead of a
   * spinner that looks stuck.
   */
  const [readingSince, setReadingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (readingSince == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [readingSince]);

  const load = async (signal?: AbortSignal) => {
    const [detailRes, runsRes] = await Promise.all([
      fetch(`/api/parser-documents/${encodeURIComponent(id)}`, { credentials: "include", signal }),
      fetch(`/api/parser-documents/${encodeURIComponent(id)}/runs`, { credentials: "include", signal }),
    ]);
    const detail = await detailRes.json().catch(() => ({}));
    if (!detailRes.ok) throw new Error(detail?.message ?? "Could not load document");
    const history = runsRes.ok ? await runsRes.json() : { runs: [] };
    setDocument(detail.document);
    setRun(detail.latestRun);
    setRuns(history.runs ?? []);
    return detail.document as ParserDocumentSummary;
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then(async (doc) => {
        const fileRes = await fetch(`/api/parser-documents/${encodeURIComponent(id)}/download`, { credentials: "include", signal: controller.signal });
        if (fileRes.ok) {
          const blob = await fileRes.blob();
          setPreviewFile(new File([blob], doc.filename, { type: doc.fileType || blob.type }));
        }
      })
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "Could not load document");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  // Saved companies, so a document can be filed against one.
  useEffect(() => {
    void fetch("/api/clients", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setClients(Array.isArray(data) ? data : (data?.items ?? [])))
      .catch(() => setClients([]));
  }, []);

  const fields = (run?.parserOutput?.extracted_fields ?? {}) as Record<string, any>;
  // What the model and the agent read — most of what a read finds. Absent on
  // a run stored before the library kept it.
  const aiValues = Array.isArray(run?.aiValues) ? run!.aiValues : [];
  const audit = (run?.parserOutput?.audit_trail ?? {}) as Record<string, any>;
  const missingKeys = useMemo(() => new Set([
    ...(run?.missingFields ?? []),
    ...Object.entries(fields).filter(([, field]) => field?.raw_value == null && field?.normalized_value == null).map(([key]) => key),
  ]), [run, fields]);
  /**
   * What people have corrected or filled in, field by field. They sit beside the
   * parser's reading in the run's review history, never over it; the latest
   * word on a field wins, and a null withdraws an earlier correction.
   */
  const corrections = useMemo(() => {
    const out = new Map<string, { value: unknown; original: unknown }>();
    for (const e of (run?.reviewHistory ?? []) as Array<{ fieldKey?: string | null; approvalState?: string; correctedValue?: unknown; originalValue?: unknown }>) {
      if (e.approvalState !== "corrected" || !e.fieldKey || e.fieldKey === "document_type" || e.fieldKey === "document") continue;
      if (e.correctedValue == null) out.delete(e.fieldKey);
      else out.set(e.fieldKey, { value: e.correctedValue, original: e.originalValue });
    }
    return out;
  }, [run]);
  // A missing field someone has filled in is read now — by a person. A
  // correction to an AI value (key `ai.…`) belongs to that value, below.
  const readableKeys = Array.from(new Set([
    ...Object.entries(fields).filter(([key, field]) => !missingKeys.has(key) && field?.normalized_value != null).map(([key]) => key),
    ...Array.from(corrections.keys()).filter((key) => !key.startsWith("ai.")),
  ]));
  const missingKeyList = Array.from(missingKeys).filter((key) => !corrections.has(key));

  /** Save one value a person read off the document. Throws so the editor can say why. */
  const saveField = async (key: string, value: string) => {
    const res = await fetch(`/api/parser-documents/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { [key]: value } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 403 ? "You can view this company's documents but not change them." : body?.message ?? "Could not save that value");
    setRun((current) => (current ? { ...current, reviewHistory: body.reviewHistory ?? current.reviewHistory } : current));
    const aiField = aiValues.find((value) => value.key === key)?.field;
    setNotice(`Saved ${fieldLabel(aiField ?? key)}.`);
  };

  const candidates: ClassificationCandidate[] = Array.isArray(audit.classification_candidates) ? audit.classification_candidates : [];
  const rejectedKeys: Array<{ key?: string; reason?: string }> = Array.isArray(audit.rejected_calculator_keys) ? audit.rejected_calculator_keys : [];
  const rulesApplied: string[] = Array.isArray(audit.rules_applied) ? audit.rules_applied.map(String) : [];
  const supplierRows: Array<Record<string, any>> = Array.isArray(run?.parserOutput?.supplier_rows) ? run!.parserOutput!.supplier_rows : [];
  const rowsWithIssues = supplierRows.filter((r) => Array.isArray(r.issues) && r.issues.length > 0);

  const loadRun = async (runId: string) => {
    const res = await fetch(`/api/parser-documents/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`, { credentials: "include" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setRun(body.run);
  };

  const patch = async (payload: Record<string, unknown>, kind: "type" | "company" | "review", message: string) => {
    setBusy(kind);
    setNotice(null);
    try {
      const res = await fetch(`/api/parser-documents/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? "Could not save that");
      setDocument(body.document);
      setNotice(message);
      setTypeDraft("");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save that");
    } finally {
      setBusy(null);
    }
  };

  /**
   * A fresh read, priced and waiting for the user to confirm the spend. Only
   * an unchanged file's stored reading is free; reading from scratch or a
   * replacement runs the whole extraction again, so it is priced, paid
   * through the wallet like any upload, and settled — a read that delivers
   * nothing comes back as tokens.
   */
  const [paidRead, setPaidRead] = useState<null | {
    quoteId: string;
    file?: File;
    tokens: number;
    balance: number;
    sufficient: boolean;
    shortfall: number;
  }>(null);

  const priceFreshRead = async (replacement?: File) => {
    setBusy("reparse");
    setNotice(null);
    try {
      const init: RequestInit = { method: "POST", credentials: "include" };
      if (replacement) {
        const form = new FormData();
        form.append("file", replacement, replacement.name);
        init.body = form;
      }
      const res = await fetch(`/api/parser-documents/${encodeURIComponent(id)}/reread/quote`, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? "We could not price a fresh read of this document.");
      const priced = await fetch(`/api/tokens/quote/${encodeURIComponent(body.quoteId)}`, { credentials: "include" });
      const cost = await priced.json().catch(() => ({}));
      if (!priced.ok) throw new Error(cost?.message ?? "We could not work out what this read costs.");
      setPaidRead({
        quoteId: String(body.quoteId),
        file: replacement,
        tokens: Number(cost.tokens ?? 0),
        balance: Number(cost.balance ?? 0),
        sufficient: cost.sufficient !== false || Boolean(cost.alreadyAuthorized),
        shortfall: Number(cost.shortfall ?? 0),
      });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not price a fresh read");
    } finally {
      setBusy(null);
      if (replaceRef.current) replaceRef.current.value = "";
    }
  };

  const confirmFreshRead = async () => {
    if (!paidRead) return;
    const { quoteId, file } = paidRead;
    setBusy("reparse");
    setNotice(null);
    try {
      const auth = await fetch("/api/tokens/authorize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      const authBody = await auth.json().catch(() => ({}));
      if (!auth.ok) {
        throw new Error(
          auth.status === 402
            ? `${authBody?.message ?? "You do not have enough tokens for this read."} Add tokens in Settings → Billing.`
            : authBody?.message ?? "Could not authorise this read.",
        );
      }
      window.dispatchEvent(new CustomEvent("okiru:tokens-changed"));

      const form = new FormData();
      form.append("quoteId", quoteId);
      if (file) form.append("file", file, file.name);
      setReadingSince(Date.now());
      let res: Response;
      try {
        res = await fetch(`/api/parser-documents/${encodeURIComponent(id)}/reread`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
      } finally {
        setReadingSince(null);
      }
      const body = await res.json().catch(() => ({}));

      // Settle the paid run whatever happened — the server decides from the
      // parser's own record what was delivered, and refunds what was not.
      let refunded = "";
      try {
        const settled = await fetch(`/api/tokens/runs/${encodeURIComponent(quoteId)}/settle-outcome`, {
          method: "POST",
          credentials: "include",
        });
        const settledBody = await settled.json().catch(() => null);
        if (settledBody?.state === "settled" && Number(settledBody.refundedTokens) > 0) {
          refunded = ` ${Number(settledBody.refundedTokens).toLocaleString("en-ZA")} tokens were returned to your balance.`;
          window.dispatchEvent(new CustomEvent("okiru:tokens-changed"));
        }
      } catch {
        // The server's own sweep settles every paid run regardless.
      }

      setPaidRead(null);
      if (!res.ok) throw new Error(`${body?.message ?? "The document could not be read again."}${refunded}`);
      await load();
      if (file) setPreviewFile(file);
      setNotice(`${file ? `Read again from ${file.name}.` : "Read again from scratch."}${refunded}`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not read this document again");
    } finally {
      setBusy(null);
    }
  };

  /** Re-read the stored bytes, or a replacement file if one was chosen. */
  const reparse = async (replacement?: File) => {
    setBusy("reparse");
    setNotice(null);
    try {
      const init: RequestInit = { method: "POST", credentials: "include" };
      if (replacement) {
        const form = new FormData();
        form.append("file", replacement, replacement.name);
        init.body = form;
      }
      const res = await fetch(`/api/parser-documents/${encodeURIComponent(id)}/reparse`, init);
      const body = await res.json().catch(() => ({}));
      // Nothing stored to show — a real read is needed, and it is priced first.
      if (res.status === 402 && body?.code === "PRICE_FIRST") {
        setBusy(null);
        await priceFreshRead(replacement);
        return;
      }
      if (!res.ok) throw new Error(body?.message ?? "The parser could not read this file");
      await load();
      if (replacement) setPreviewFile(replacement);
      setNotice(
        replacement
          ? `Re-read from ${replacement.name}.`
          : body?.reused
            ? "This file hasn't changed, so this is its stored reading — nothing was read again, and nothing was charged."
            : "Re-read from the stored file.",
      );
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not re-read this document");
    } finally {
      setBusy(null);
      if (replaceRef.current) replaceRef.current.value = "";
    }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-[color:var(--ink)] text-[color:var(--body)]"><span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading document</span></div>;
  if (error || !document) return <div className="grid min-h-screen place-items-center bg-[color:var(--ink)] text-red-300"><div className="text-center"><FileWarning className="mx-auto mb-3 h-7 w-7" /><p>{error || "Document not found"}</p><button onClick={() => navigate("/documents")} className="mt-4 text-sm text-white underline">Back to documents</button></div></div>;

  const currentType = document.documentType || run?.documentType || "";
  const linkedClient = clients.find((c) => c.clientId === document.entityId);
  /** The one status word for this document. */
  const statusWord = run ? STATUS_WORD[run.status] : null;
  /** The type is in question: offer the other likely types up front. */
  const typeInQuestion = Boolean(run) && (run!.status !== "passed" || !currentType || run!.overallConfidence < 0.6);
  const warnings = run
    ? Array.from(
        new Set([
          ...run.lowConfidenceFields.map(lowConfidenceSentence),
          ...[...run.warnings, ...run.errors, ...run.reviewReasons].map(plainWarning),
        ]),
      )
    : [];
  const needsAttention = rowsWithIssues.length > 0 || warnings.length > 0 || rejectedKeys.length > 0;
  const valueCount = readableKeys.length + aiValues.length;
  const checkedCount = Array.from(corrections.keys()).length;
  /** Nothing usable was read: Read again, Replace and Change the type are the way on, so they start open. */
  const recoveryFirst = !run || run.status === "failed";
  /** Which reading is on screen, when it is not the newest (runs are newest first). */
  const runIndex = run ? runs.findIndex((item) => item.runId === run.runId) : -1;
  const olderReading = runs.length > 1 && runIndex > 0 ? { n: runs.length - runIndex, of: runs.length } : null;

  const candidatesSection = candidates.length > 0 ? (
    <section data-testid="classification-candidates">
      <h2 className="mb-1 text-[14px] font-semibold text-white">Is this the right type?</h2>
      <p className="mb-3 text-[11.5px] text-[color:var(--body)]">
        We read it as {currentType || "an unknown type"}. Other likely types:
      </p>
      <div className="space-y-2">
        {candidates.map((c, i) => {
          const type = String(c.document_type ?? "Unknown");
          const chosen = type === currentType;
          const evidence = [...(c.reasons ?? []), ...(c.matched_evidence ?? [])].slice(0, 4);
          return (
            <div key={`${type}-${i}`} className={`rounded-xl border px-3.5 py-2.5 ${chosen ? "border-white/[0.18] bg-white/[0.04]" : "border-white/[0.07] bg-[color:var(--ink-3)]"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-white">{type}</span>
                {chosen ? (
                  <span className="text-[11px] text-[color:var(--body)]">current</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void patch({ documentType: type, note: "Chosen from the classifier's own candidates." }, "type", `Recorded as “${type}”.`)}
                    className="shrink-0 rounded-lg border border-white/[0.14] px-2.5 py-1 text-[11px] text-[color:var(--body)] hover:bg-white/[0.06] disabled:opacity-40"
                    data-testid={`classification-pick-${type}`}
                  >
                    Use this
                  </button>
                )}
              </div>
              <HowWeRead>
                <p>How sure we are: {confidenceWord(Number(c.confidence ?? 0))} ({Math.round(Number(c.confidence ?? 0) * 100)}%)</p>
                {c.pillar ? <p>Scorecard area: {c.pillar}</p> : null}
                {evidence.length > 0 ? <p>Why: {evidence.join(" · ")}</p> : null}
              </HowWeRead>
            </div>
          );
        })}
      </div>
    </section>
  ) : null;

  return <div className="min-h-screen bg-[color:var(--ink)] text-[color:var(--hi)]">
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      {/* ONE header: what the document is, which file it is, how the read went,
          and the one thing this page is for — signing it off. */}
      <header className="mb-4 flex flex-col gap-4 border-b border-[color:var(--rule)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="max-w-4xl text-[24px] font-semibold leading-tight text-white" data-testid="document-type">
            {currentType || (run ? "We could not tell what this document is" : "Not read yet")}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[color:var(--body)]">
            <span className="truncate">{document.filename} · uploaded {new Date(document.uploadedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>
            {statusWord && (
              <span className={`inline-flex items-center gap-1.5 ${statusWord.tone}`} data-testid="document-status">
                {statusWord.icon}
                {statusWord.label}
              </span>
            )}
            {olderReading && (
              <span className="inline-flex items-center gap-2 text-amber-200" data-testid="document-older-reading">
                Reading {olderReading.n} of {olderReading.of}, not the latest.
                <button
                  type="button"
                  onClick={() => void loadRun(runs[0].runId)}
                  className="rounded text-white underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  data-testid="document-show-latest-reading"
                >
                  Show the latest
                </button>
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/parser-documents/${encodeURIComponent(id)}/download`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 text-[12px] font-medium text-[color:var(--body)] transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download
            </a>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void patch(
                  { reviewed: !document.reviewedAt },
                  "review",
                  document.reviewedAt ? "Reopened — it's back in the company's Needs review." : "Signed off — it has left the company's Needs review.",
                )
              }
              className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20 disabled:opacity-40 ${
                document.reviewedAt ? "border border-white/[0.12] text-[color:var(--body)] hover:bg-white/[0.06]" : "bg-white text-black hover:bg-white/90"
              }`}
              data-testid="document-mark-reviewed"
            >
              {busy === "review" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
              {document.reviewedAt ? "Reopen" : "Mark as reviewed"}
            </button>
          </div>
          {/* The team handoff, said as the button's helper text. */}
          <p className="text-[11.5px] text-[color:var(--body)] lg:text-right" data-testid="document-review-state">
            {document.reviewedAt
              ? `Reviewed ${new Date(document.reviewedAt).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} by your team.`
              : document.status === "review_required" || document.status === "failed"
                ? "Check what was read against the document, fix anything wrong, then sign it off."
                : "Optional for a document that read cleanly."}
          </p>
        </div>
      </header>

      {/* Everything else a person can do here, folded into one place. */}
      <details
        className="group mb-4 rounded-xl border border-white/[0.07] bg-[color:var(--ink-2)] px-4 py-2.5"
        open={recoveryFirst || undefined}
        data-testid="document-more-actions"
      >
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-[12.5px] font-medium text-[color:var(--body)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
          More actions
          <span className="ml-auto text-[11.5px] font-normal text-[color:var(--body)]">File under a company · Change the type · Read again</span>
        </summary>
        <div className="mt-3 grid gap-4 pb-1 lg:grid-cols-3">
          <div>
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--hi)]"><Building2 className="h-3.5 w-3.5" aria-hidden /> File under a company</p>
            <p className="mt-0.5 text-[11.5px] text-[color:var(--body)]">
              {linkedClient ? `Filed under ${linkedClient.name}.` : "Not filed — it will not appear in any client's evidence."}
            </p>
            <select
              value={document.entityId ?? ""}
              disabled={busy !== null}
              onChange={(e) => void patch({ entityId: e.target.value || null }, "company", e.target.value ? "Filed against the company." : "Unlinked from the company.")}
              className="mt-2 h-9 w-full rounded-lg border border-[color:var(--rule)] bg-[color:var(--ink-3)] px-2 text-[12px] text-white disabled:opacity-40"
              aria-label="Company"
              data-testid="document-company-select"
            >
              <option value="">Not filed</option>
              {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[12px] font-medium text-[color:var(--hi)]">Change the type</p>
            <p className="mt-0.5 text-[11.5px] text-[color:var(--body)]">Kept beside the original reading, not over it.</p>
            <div className="mt-2 flex gap-2">
              <input
                value={typeDraft}
                onChange={(e) => setTypeDraft(e.target.value)}
                placeholder={currentType || "e.g. B-BBEE Certificate"}
                aria-label="Document type"
                className="h-9 min-w-0 flex-1 rounded-lg border border-[color:var(--rule)] bg-[color:var(--ink-3)] px-2 text-[12px] text-white"
                data-testid="document-type-input"
              />
              <button
                type="button"
                disabled={!typeDraft.trim() || busy !== null}
                onClick={() => void patch({ documentType: typeDraft.trim() }, "type", `Recorded as “${typeDraft.trim()}”.`)}
                className="h-9 rounded-lg border border-white/[0.14] px-3 text-[12px] font-semibold text-white hover:bg-white/[0.06] disabled:opacity-40"
                data-testid="document-type-save"
              >
                Save
              </button>
            </div>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--hi)]"><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Read again</p>
            <p className="mt-0.5 text-[11.5px] text-[color:var(--body)]">
              The saved reading is free. Reading from scratch, or a replacement file, is priced first — the earlier reading is kept.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void reparse()}
                className="h-9 rounded-lg border border-white/[0.12] px-3 text-[12px] text-[color:var(--body)] hover:bg-white/[0.06] disabled:opacity-40"
                data-testid="document-reparse"
              >
                {busy === "reparse" ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" aria-hidden /> : "Use saved reading"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void priceFreshRead()}
                className="h-9 rounded-lg border border-white/[0.12] px-3 text-[12px] text-[color:var(--body)] hover:bg-white/[0.06] disabled:opacity-40"
                data-testid="document-read-fresh"
              >
                Read from scratch
              </button>
              <input
                ref={replaceRef}
                type="file"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void priceFreshRead(f); }}
                data-testid="document-replace-input"
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => replaceRef.current?.click()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 text-[12px] text-[color:var(--body)] hover:bg-white/[0.06] disabled:opacity-40"
                data-testid="document-replace"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden /> Replace file
              </button>
            </div>
          </div>
        </div>
      </details>

      {notice && <div className="mb-4 rounded-xl border border-white/[0.10] bg-[color:var(--ink-3)] px-4 py-2.5 text-[12.5px] text-[color:var(--body)]" role="status" data-testid="document-notice">{notice}</div>}

      {/* The paid read itself, under way: it can take minutes, so say so, and count. */}
      {readingSince != null && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/[0.10] bg-[color:var(--ink-3)] px-4 py-3" role="status" data-testid="document-reading-progress">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[color:var(--body)] motion-reduce:animate-none" aria-hidden />
          <p className="min-w-0 text-[13px] text-white">
            Reading {paidRead?.file ? paidRead.file.name : document.filename}… {formatElapsed(now - readingSince)}.{" "}
            <span className="text-[color:var(--body)]">A long or scanned document can take a few minutes; the earlier reading stays on record.</span>
          </p>
        </div>
      )}

      {/* A fresh read, priced — nothing is charged until this is confirmed. */}
      {paidRead && readingSince == null && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-white/[0.10] bg-[color:var(--ink-3)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="document-fresh-read-price">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white">
              Reading {paidRead.file ? paidRead.file.name : "this document"} {paidRead.file ? "" : "again from scratch "}costs{" "}
              {paidRead.tokens.toLocaleString("en-ZA")} tokens
            </p>
            <p className="mt-0.5 text-[12px] leading-5 text-[color:var(--body)]">
              You have {paidRead.balance.toLocaleString("en-ZA")}. If the read gives us nothing, the tokens come back automatically.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setPaidRead(null)}
              className="h-9 rounded-lg px-3 text-[12px] text-[color:var(--body)] hover:text-white disabled:opacity-40"
            >
              Cancel
            </button>
            {paidRead.sufficient ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void confirmFreshRead()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.16] px-3 text-[12px] font-semibold text-white hover:bg-white/[0.08] disabled:opacity-40"
                data-testid="document-fresh-read-confirm"
              >
                {busy === "reparse" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Read it — {paidRead.tokens.toLocaleString("en-ZA")} tokens
              </button>
            ) : (
              <a
                href="/settings/billing"
                className="inline-flex h-9 items-center rounded-lg border border-white/[0.16] px-3 text-[12px] font-semibold text-white"
                data-testid="document-fresh-read-topup"
              >
                Add tokens — {paidRead.shortfall.toLocaleString("en-ZA")} short
              </a>
            )}
          </div>
        </div>
      )}

      {/* The document, directly under the header, beside what we read from it. */}
      {/* Download is in the header already; the preview does not offer it twice. */}
      <ExtractionReviewPane file={previewFile} title={document.filename} className="min-h-[720px]" focus={focus} showDownload={false}>
        <div className="h-full overflow-y-auto bg-[color:var(--ink-2)] p-5 sm:p-6">
          {!run ? <div className="py-16 text-center text-sm text-[color:var(--body)]">This file is saved, but it has not been read yet. Use Read again, under More actions, to have it read now.</div> : <div className="space-y-8">
            {/* 1. The type, when it is in question. */}
            {typeInQuestion && candidatesSection}

            {/* 2. ONE list of what was read — whichever reader read it. Fact-
                checking and fixing are one gesture: look at the document, click
                the value, type. A correction is kept beside the reading. */}
            <section data-testid="read-values">
              <div className="mb-1 flex items-center justify-between gap-3">
                <h2 className="text-[14px] font-semibold text-white">What we read from it</h2>
                <span className="text-[11px] text-[color:var(--body)]">
                  {valueCount} value{valueCount === 1 ? "" : "s"}{checkedCount > 0 ? ` · ${checkedCount} checked by your team` : ""}
                </span>
              </div>
              <p className="mb-2 text-[11.5px] text-[color:var(--body)]">Check each value against the document. Click one to correct it.</p>
              <div className="border-y border-[color:var(--rule)]">
                <div data-testid="extracted-fields" role="group" aria-label="Values found in the text">
                  {readableKeys.map((key) => {
                    const field = (fields[key] ?? {}) as Record<string, any>;
                    const fix = corrections.get(key);
                    const current = fix ? fix.value : field.normalized_value;
                    const shown = formatParserValue(current);
                    const page = field.source?.page;
                    return (
                      <div key={key} className="grid gap-1 border-b border-[color:var(--rule)] py-3.5 sm:grid-cols-[180px_1fr] sm:gap-3" data-testid={`field-row-${key}`}>
                        <div className="text-[12px] text-[color:var(--body)]">{fieldLabel(key)}</div>
                        <div className="min-w-0">
                          <div className="text-[13px] text-white">
                            {/* A list is checked against the document, not retyped as one line of text. */}
                            <EditableValue value={shown} label={fieldLabel(key)} onSave={(next) => saveField(key, next)} testId={`field-${key}`} disabled={Array.isArray(current)} />
                          </div>
                          {fix && (
                            <p className="mt-1 text-[11px] text-[color:var(--body)]" data-testid={`field-${key}-corrected`}>
                              {fix.original != null
                                ? `Corrected by your team. Originally read as “${formatParserValue(fix.original)}”`
                                : "Added by your team. It wasn't found in the document."}
                            </p>
                          )}
                          {page != null && (
                            <button
                              type="button"
                              onClick={() => setFocus({ page: Number(page), sheet: null, nonce: Date.now() })}
                              className="mt-1 inline-flex items-center gap-1 rounded px-0.5 text-[11px] text-[color:var(--hi)] underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                              data-testid={`field-${key}-show`}
                            >
                              <MapPin className="h-3 w-3" aria-hidden /> Show in document
                            </button>
                          )}
                          <HowWeRead testId={`field-${key}-how`}>
                            <p className="flex flex-wrap items-center gap-1.5">{READER_WORDS.rule} <LayerBadge layer="rule" /></p>
                            {/* null: a reader that does not score confidence (ESG) — not a 0% score. */}
                            <p>How sure we are: {fix ? "Checked by your team" : confidenceWord(field.confidence)}</p>
                            {/* The raw text behind the number: without it a normalisation bug — "R1,200,000" read as 1200 — is invisible. */}
                            {field.raw_value != null && String(field.raw_value) !== String(field.normalized_value) && (
                              <p>Read as “{String(field.raw_value)}”{field.data_type ? ` (${String(field.data_type)})` : ""}</p>
                            )}
                            {field.source?.text_snippet && <p className="italic">“{field.source.text_snippet}”</p>}
                            <p>{page != null ? `Page ${page}` : "Page unavailable"}{field.source?.table ? `, ${field.source.table}` : ""}</p>
                          </HowWeRead>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {aiValues.length > 0 && (
                  <AiValuesSection
                    values={aiValues}
                    corrections={corrections}
                    onSave={saveField}
                    onShow={(value) => setFocus({ page: value.page, sheet: sheetOfSource(value.sourceFile), nonce: Date.now() })}
                  />
                )}
                {valueCount === 0 && <p className="py-4 text-[12px] text-[color:var(--body)]">Nothing was read from this document yet.</p>}
              </div>
            </section>

            {/* 3. What was expected and not found — add it if the document shows it. */}
            <section data-testid="missing-fields">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-[14px] font-semibold text-white">Not found in this document</h2>
                <span className="text-[11px] text-[color:var(--body)]">{missingKeyList.length} expected</span>
              </div>
              {missingKeyList.length === 0 ? (
                <p className="border-y border-[color:var(--rule)] py-4 text-[12px] text-[color:var(--body)]">Nothing expected is missing.</p>
              ) : (
                <>
                  <p className="mb-3 text-[11.5px] text-[color:var(--body)]">If the document does show one of these, add it — you know where to look better than we did.</p>
                  <div className="divide-y divide-[color:var(--rule)] border-y border-amber-400/20">
                    {missingKeyList.map((key) => (
                      <div key={key} className="flex items-center justify-between gap-4 py-3" data-testid={`missing-row-${key}`}>
                        <span className="text-[12px] text-[color:var(--body)]">{fieldLabel(key)}</span>
                        <div className="min-w-0 max-w-[60%] text-[12.5px] text-white">
                          <EditableValue value={null} label={fieldLabel(key)} onSave={(next) => saveField(key, next)} testId={`field-${key}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* 4. Needs attention — only when there is something. */}
            {needsAttention && (
              <section data-testid="needs-attention">
                <h2 className="mb-3 text-[14px] font-semibold text-white">Needs attention</h2>
                <div className="space-y-4">
                  {rowsWithIssues.length > 0 && (
                    <div data-testid="supplier-row-issues">
                      <h3 className="mb-1.5 text-[12.5px] font-medium text-[color:var(--hi)]">Supplier rows</h3>
                      <div className="divide-y divide-[color:var(--rule)] border-y border-[color:var(--rule)]">
                        {rowsWithIssues.map((r, i) => (
                          <div key={i} className="py-2.5">
                            <p className="text-[12.5px] text-white">{String(r.supplier_name ?? "Unnamed supplier")}</p>
                            <p className="mt-0.5 text-[11px] text-amber-300">{(r.issues as string[]).join(" · ")}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {warnings.length > 0 && (
                    <div className="space-y-1.5" data-testid="document-warnings">
                      {warnings.map((message) => (
                        <p key={message} className="flex gap-2.5 border-l border-amber-500/50 py-1 pl-3 text-[12px] leading-5 text-[color:var(--body)]">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                          {message}
                        </p>
                      ))}
                    </div>
                  )}
                  {/* Read, then refused: a different problem from never being found. */}
                  {rejectedKeys.length > 0 && (
                    <div data-testid="rejected-keys">
                      <h3 className="mb-1 text-[12.5px] font-medium text-[color:var(--hi)]">Read, but left out of the score</h3>
                      <div className="divide-y divide-[color:var(--rule)] border-y border-[color:var(--rule)]">
                        {rejectedKeys.map((r, i) => (
                          <div key={`${r.key}-${i}`} className="flex items-start justify-between gap-4 py-2.5">
                            <span className="text-[12px] text-[color:var(--body)]">{fieldLabel(String(r.key ?? "unknown"))}</span>
                            <span className="text-right text-[11px] text-[color:var(--body)]">{plainReason(r.reason)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* 5. The record of the read itself, for an expert — closed. */}
            <details className="group" data-testid="technical-record">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-[13px] font-medium text-[color:var(--body)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
                Technical record
              </summary>
              <div className="mt-3 space-y-4">
                {!typeInQuestion && candidatesSection}
                <dl className="grid gap-3 border-y border-[color:var(--rule)] py-4 text-[12px] sm:grid-cols-2">
                  <div><dt className="text-[color:var(--body)]">How sure we are of the type</dt><dd className="mt-1 text-[color:var(--body)]">{confidenceWord(run.overallConfidence)} ({Math.round(run.overallConfidence * 100)}%)</dd></div>
                  <div><dt className="text-[color:var(--body)]">Needs a person</dt><dd className="mt-1 text-[color:var(--body)]">{run.requiresHumanReview ? "Yes" : "No"}</dd></div>
                  <div><dt className="text-[color:var(--body)]">Why this type</dt><dd className="mt-1 text-[color:var(--body)]">{audit.classification_reason || "No reason recorded"}</dd></div>
                  <div><dt className="text-[color:var(--body)]">Scorecard area</dt><dd className="mt-1 text-[color:var(--body)]">{String(run.parserOutput?.pillar || "Not attributed")}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-[color:var(--body)]">Evidence matched</dt><dd className="mt-1 text-[color:var(--body)]">{audit.matched_patterns?.join(", ") || "None recorded"}</dd></div>
                  {rulesApplied.length > 0 && <div className="sm:col-span-2"><dt className="text-[color:var(--body)]">Rules applied</dt><dd className="mt-1 text-[color:var(--body)]">{rulesApplied.join(", ")}</dd></div>}
                  <div><dt className="text-[color:var(--body)]">Reader version</dt><dd className="mt-1 text-[color:var(--body)]">{run.graphVersion || "Not recorded"}</dd></div>
                  {runs.length > 1 && (
                    <div>
                      <dt className="text-[color:var(--body)]">Earlier readings</dt>
                      <dd className="mt-1">
                        <select
                          value={run.runId}
                          onChange={(event) => void loadRun(event.target.value)}
                          aria-label="Earlier readings"
                          className="h-9 rounded-lg border border-[color:var(--rule)] bg-[color:var(--ink-3)] px-3 text-white"
                          data-testid="document-run-select"
                        >
                          {runs.map((item, index) => <option key={item.runId} value={item.runId}>Reading {runs.length - index} · {new Date(item.createdAt).toLocaleDateString("en-ZA")}</option>)}
                        </select>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </details>
          </div>}
        </div>
      </ExtractionReviewPane>
    </main>
  </div>;
}
