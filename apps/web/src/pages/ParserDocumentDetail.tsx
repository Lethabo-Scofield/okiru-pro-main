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
import { AlertTriangle, Building2, Check, Download, FileWarning, Loader2, RefreshCw, Upload } from "lucide-react";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { ExtractionReviewPane } from "@/components/upload/ExtractionReviewPane";
import { PARSER_STATUS_PRESENTATION, fieldLabel, formatParserValue, type ParserDocumentSummary, type ParserRunDetail } from "@/lib/parserDocuments";

interface ClientRow { clientId: string; name: string }

/** A classification the parser considered and did not choose. */
interface ClassificationCandidate {
  document_type?: string;
  pillar?: string;
  confidence?: number;
  matched_evidence?: string[];
  reasons?: string[];
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
  const [busy, setBusy] = useState<null | "type" | "company" | "reparse">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [typeDraft, setTypeDraft] = useState("");
  const replaceRef = useRef<HTMLInputElement>(null);

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
  const audit = (run?.parserOutput?.audit_trail ?? {}) as Record<string, any>;
  const missingKeys = useMemo(() => new Set([
    ...(run?.missingFields ?? []),
    ...Object.entries(fields).filter(([, field]) => field?.raw_value == null && field?.normalized_value == null).map(([key]) => key),
  ]), [run, fields]);
  const readableFields = Object.entries(fields).filter(([key, field]) => !missingKeys.has(key) && field?.normalized_value != null);
  const missingFields = Object.entries(fields).filter(([key]) => missingKeys.has(key));
  const presentation = run ? PARSER_STATUS_PRESENTATION[run.status] : null;

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

  const patch = async (payload: Record<string, unknown>, kind: "type" | "company", message: string) => {
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
      if (!res.ok) throw new Error(body?.message ?? "The parser could not read this file");
      await load();
      if (replacement) setPreviewFile(replacement);
      setNotice(replacement ? `Re-read from ${replacement.name}.` : "Re-read from the stored file.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not re-read this document");
    } finally {
      setBusy(null);
      if (replaceRef.current) replaceRef.current.value = "";
    }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-black text-[#8e8e93]"><span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading document</span></div>;
  if (error || !document) return <div className="grid min-h-screen place-items-center bg-black text-red-300"><div className="text-center"><FileWarning className="mx-auto mb-3 h-7 w-7" /><p>{error || "Document not found"}</p><button onClick={() => navigate("/documents")} className="mt-4 text-sm text-white underline">Back to documents</button></div></div>;

  const currentType = document.documentType || run?.documentType || "";
  const linkedClient = clients.find((c) => c.clientId === document.entityId);

  return <div className="min-h-screen bg-black text-[#f5f5f7]">
    <header className="sticky top-0 z-20 h-14 border-b border-[#2c2c2e] bg-black"><div className="flex h-full items-center justify-between px-4 sm:px-6"><div className="flex min-w-0 items-center gap-4"><AppNavBack href="/documents" eyebrow="Library" label="Documents" variant="dark" /><div className="hidden h-5 w-px bg-[#2c2c2e] sm:block" /><span className="truncate text-[14px] font-medium text-white">{document.filename}</span></div><div className="flex items-center gap-2"><a href={`/api/parser-documents/${encodeURIComponent(id)}/download`} title="Download original" className="grid h-9 w-9 place-items-center text-[#d1d1d6] hover:bg-white/[0.06]"><Download className="h-4 w-4" /></a><UserAccountMenu variant="dashboard" /></div></div></header>
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 border-b border-[#2c2c2e] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {/* The type leads, always — including when nothing classified it.
              "Not parsed" as the only answer is what made a misread document a
              dead end. */}
          <p className="text-[11px] uppercase tracking-wide text-[#636366]">Document type</p>
          <h1 className="mt-1 max-w-4xl text-[24px] font-semibold text-white" data-testid="document-type">
            {currentType || "Not yet classified"}
          </h1>
          <p className="mt-2 text-[12px] text-[#8e8e93]">{document.filename} · uploaded {new Date(document.uploadedAt).toLocaleString("en-ZA")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-[12px]">{presentation && <span className={`inline-flex items-center gap-2 ${presentation.tone}`}><span className={`h-2 w-2 rounded-full ${presentation.dot}`} />{presentation.description}</span>}<span className="text-[#8e8e93]">Classification confidence <strong className="ml-1 text-white">{run ? `${Math.round(run.overallConfidence * 100)}%` : "Missing"}</strong></span>{runs.length > 1 && <select value={run?.runId} onChange={(event) => void loadRun(event.target.value)} className="h-9 border border-[#38383a] bg-[#1c1c1e] px-3 text-white">{runs.map((item, index) => <option key={item.runId} value={item.runId}>Run {runs.length - index} - {new Date(item.createdAt).toLocaleDateString("en-ZA")}</option>)}</select>}</div>
      </div>

      {notice && <div className="mb-4 rounded-xl border border-white/[0.10] bg-[#141416] px-4 py-2.5 text-[12.5px] text-[#d1d1d6]" data-testid="document-notice">{notice}</div>}

      {/* The three things a person can do here. */}
      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        {/* 1. File it against a company. */}
        <div className="rounded-xl border border-white/[0.07] bg-[#111113] p-4">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#d1d1d6]"><Building2 className="h-3.5 w-3.5" /> Company</div>
          <p className="mt-1 text-[11.5px] text-[#8e8e93]">
            {linkedClient ? `Filed under ${linkedClient.name}.` : "Not filed against a company — it will not appear in any client's evidence."}
          </p>
          <select
            value={document.entityId ?? ""}
            disabled={busy !== null}
            onChange={(e) => void patch({ entityId: e.target.value || null }, "company", e.target.value ? "Filed against the company." : "Unlinked from the company.")}
            className="mt-2.5 h-9 w-full rounded-lg border border-[#38383a] bg-[#1c1c1e] px-2 text-[12px] text-white disabled:opacity-40"
            data-testid="document-company-select"
          >
            <option value="">Not filed</option>
            {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
          </select>
        </div>

        {/* 2. Correct the type by hand. */}
        <div className="rounded-xl border border-white/[0.07] bg-[#111113] p-4">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#d1d1d6]"><Check className="h-3.5 w-3.5" /> Correct the type</div>
          <p className="mt-1 text-[11.5px] text-[#8e8e93]">Recorded against the run, not over it.</p>
          <div className="mt-2.5 flex gap-2">
            <input
              value={typeDraft}
              onChange={(e) => setTypeDraft(e.target.value)}
              placeholder={currentType || "e.g. B-BBEE Certificate"}
              className="h-9 min-w-0 flex-1 rounded-lg border border-[#38383a] bg-[#1c1c1e] px-2 text-[12px] text-white"
              data-testid="document-type-input"
            />
            <button
              type="button"
              disabled={!typeDraft.trim() || busy !== null}
              onClick={() => void patch({ documentType: typeDraft.trim() }, "type", `Recorded as “${typeDraft.trim()}”.`)}
              className="h-9 rounded-lg bg-white px-3 text-[12px] font-semibold text-black disabled:opacity-40"
              data-testid="document-type-save"
            >
              Save
            </button>
          </div>
        </div>

        {/* 3. Try again, with the same file or a better one. */}
        <div className="rounded-xl border border-white/[0.07] bg-[#111113] p-4">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#d1d1d6]"><RefreshCw className="h-3.5 w-3.5" /> Read it again</div>
          <p className="mt-1 text-[11.5px] text-[#8e8e93]">Appended as a new run — the previous reading is kept.</p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void reparse()}
              className="h-9 flex-1 rounded-lg border border-white/[0.12] px-3 text-[12px] text-[#d1d1d6] hover:bg-white/[0.06] disabled:opacity-40"
              data-testid="document-reparse"
            >
              {busy === "reparse" ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Re-read"}
            </button>
            <input
              ref={replaceRef}
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void reparse(f); }}
              data-testid="document-replace-input"
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => replaceRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 text-[12px] text-[#d1d1d6] hover:bg-white/[0.06] disabled:opacity-40"
              data-testid="document-replace"
            >
              <Upload className="h-3.5 w-3.5" /> Replace file
            </button>
          </div>
        </div>
      </div>

      <ExtractionReviewPane file={previewFile} title={document.filename} className="min-h-[720px]">
        <div className="h-full overflow-y-auto bg-[#111113] p-5 sm:p-6">
          {!run ? <div className="py-16 text-center text-sm text-[#8e8e93]">This file is saved, but no parser run has been recorded yet. Use “Re-read” above to have it read now.</div> : <div className="space-y-8">
            {/* What else it could have been. The single most useful thing for
                resolving a misclassification, and it was invisible. */}
            {candidates.length > 0 && <section data-testid="classification-candidates">
              <h2 className="mb-1 text-[14px] font-semibold text-white">What else this could be</h2>
              <p className="mb-3 text-[11.5px] text-[#8e8e93]">The classifier weighed these and chose {currentType || "none"}. Pick one to correct it.</p>
              <div className="space-y-2">
                {candidates.map((c, i) => {
                  const type = String(c.document_type ?? "Unknown");
                  const chosen = type === currentType;
                  return <div key={`${type}-${i}`} className={`rounded-xl border px-3.5 py-3 ${chosen ? "border-emerald-400/25 bg-[#0f1512]" : "border-white/[0.07] bg-[#141416]"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12.5px] text-white">{type}{c.pillar ? <span className="ml-2 text-[11px] text-[#636366]">{c.pillar}</span> : null}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11.5px] tabular-nums text-[#8e8e93]">{Math.round(Number(c.confidence ?? 0) * 100)}%</span>
                        {chosen
                          ? <span className="text-[11px] text-emerald-300">chosen</span>
                          : <button type="button" disabled={busy !== null} onClick={() => void patch({ documentType: type, note: "Chosen from the classifier's own candidates." }, "type", `Recorded as “${type}”.`)} className="rounded-lg border border-white/[0.14] px-2.5 py-1 text-[11px] text-[#d1d1d6] hover:bg-white/[0.06] disabled:opacity-40" data-testid={`classification-pick-${type}`}>Use this</button>}
                      </div>
                    </div>
                    {(c.reasons?.length || c.matched_evidence?.length) ? <p className="mt-1.5 text-[11px] leading-4 text-[#8e8e93]">{[...(c.reasons ?? []), ...(c.matched_evidence ?? [])].slice(0, 4).join(" · ")}</p> : null}
                  </div>;
                })}
              </div>
            </section>}

            <section><div className="mb-3 flex items-center justify-between"><h2 className="text-[14px] font-semibold text-white">Extracted fields</h2><span className="text-[11px] text-[#636366]">{readableFields.length} read</span></div><div className="divide-y divide-[#2c2c2e] border-y border-[#2c2c2e]">{readableFields.map(([key, field]) => <div key={key} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr_80px]"><div className="text-[12px] text-[#8e8e93]">{fieldLabel(key)}</div><div><p className="break-words text-[13px] text-white">{formatParserValue(field.normalized_value)}</p>{/* The raw text behind the number. Without it a normalisation bug — "R1,200,000" read as 1200 — is invisible and unarguable. */}{field.raw_value != null && String(field.raw_value) !== String(field.normalized_value) && <p className="mt-1 text-[11px] text-[#636366]">read as “{String(field.raw_value)}”{field.data_type ? ` · ${field.data_type}` : ""}</p>}{field.source?.text_snippet && <details className="mt-2"><summary className="cursor-pointer text-[11px] text-[#636366]">View source</summary><p className="mt-2 border-l border-[#48484a] pl-3 text-[11px] leading-5 text-[#8e8e93]">{field.source.text_snippet}</p><p className="mt-1 text-[10px] text-[#636366]">{field.source.page != null ? `Page ${field.source.page}` : "Page unavailable"}{field.source.table ? `, ${field.source.table}` : ""}</p></details>}</div><div className={`text-right text-[12px] tabular-nums ${Number(field.confidence) >= 0.85 ? "text-emerald-300" : "text-amber-300"}`}>{Math.round(Number(field.confidence || 0) * 100)}%</div></div>)}</div></section>

            <section><div className="mb-3 flex items-center justify-between"><h2 className="text-[14px] font-semibold text-white">Could not be read</h2><span className="text-[11px] text-[#636366]">{missingFields.length} expected</span></div>{missingFields.length === 0 ? <p className="border-y border-[#2c2c2e] py-4 text-[12px] text-[#8e8e93]">No expected fields are missing.</p> : <div className="divide-y divide-[#3a2f20] border-y border-[#3a2f20]">{missingFields.map(([key]) => <div key={key} className="flex items-center justify-between py-3"><span className="text-[12px] text-[#d1d1d6]">{fieldLabel(key)}</span><span className="text-[11px] text-amber-300">Not found</span></div>)}</div>}</section>

            {/* Read, then refused. Being told a value was found and thrown away
                is a different problem from it never being found, and the fix is
                different too — this was never shown at all. */}
            {rejectedKeys.length > 0 && <section data-testid="rejected-keys">
              <h2 className="mb-1 text-[14px] font-semibold text-white">Read, but not used</h2>
              <p className="mb-3 text-[11.5px] text-[#8e8e93]">These values were found and then refused, so nothing was scored from them.</p>
              <div className="divide-y divide-[#2c2c2e] border-y border-[#2c2c2e]">{rejectedKeys.map((r, i) => <div key={`${r.key}-${i}`} className="flex items-start justify-between gap-4 py-3"><span className="text-[12px] text-[#d1d1d6]">{fieldLabel(String(r.key ?? "unknown"))}</span><span className="text-right text-[11px] text-[#8e8e93]">{r.reason ?? "no reason recorded"}</span></div>)}</div>
            </section>}

            {rowsWithIssues.length > 0 && <section data-testid="supplier-row-issues">
              <h2 className="mb-3 text-[14px] font-semibold text-white">Supplier rows needing attention</h2>
              <div className="divide-y divide-[#2c2c2e] border-y border-[#2c2c2e]">{rowsWithIssues.map((r, i) => <div key={i} className="py-3"><p className="text-[12.5px] text-white">{String(r.supplier_name ?? "Unnamed supplier")}</p><p className="mt-0.5 text-[11px] text-amber-300">{(r.issues as string[]).join(" · ")}</p></div>)}</div>
            </section>}

            {(run.lowConfidenceFields?.length > 0 || run.warnings?.length > 0 || run.errors?.length > 0 || run.reviewReasons?.length > 0) && <section><h2 className="mb-3 text-[14px] font-semibold text-white">Warnings and problems</h2><div className="space-y-2">{Array.from(new Set([...run.lowConfidenceFields.map((key) => `${fieldLabel(key)} has low confidence`), ...run.warnings, ...run.errors, ...run.reviewReasons])).map((message) => <div key={message} className="flex gap-3 border-l border-amber-500/50 py-2 pl-3 text-[12px] leading-5 text-[#d1d1d6]"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />{message}</div>)}</div></section>}

            {run.parserOutput?.audit_trail && <section><h2 className="mb-3 text-[14px] font-semibold text-white">Parser audit</h2><dl className="grid gap-3 border-y border-[#2c2c2e] py-4 text-[12px] sm:grid-cols-2"><div><dt className="text-[#636366]">Graph version</dt><dd className="mt-1 text-[#d1d1d6]">{run.graphVersion || "Not recorded"}</dd></div><div><dt className="text-[#636366]">Pillar</dt><dd className="mt-1 text-[#d1d1d6]">{String(run.parserOutput.pillar || "Not attributed")}</dd></div><div><dt className="text-[#636366]">Classification</dt><dd className="mt-1 text-[#d1d1d6]">{audit.classification_reason || "No reason recorded"}</dd></div><div><dt className="text-[#636366]">Needs a human</dt><dd className="mt-1 text-[#d1d1d6]">{run.requiresHumanReview ? "Yes" : "No"}</dd></div><div className="sm:col-span-2"><dt className="text-[#636366]">Matched evidence</dt><dd className="mt-1 text-[#d1d1d6]">{audit.matched_patterns?.join(", ") || "No pattern evidence recorded"}</dd></div>{rulesApplied.length > 0 && <div className="sm:col-span-2"><dt className="text-[#636366]">Rules applied</dt><dd className="mt-1 text-[#d1d1d6]">{rulesApplied.join(", ")}</dd></div>}</dl></section>}
          </div>}
        </div>
      </ExtractionReviewPane>
    </main>
  </div>;
}
