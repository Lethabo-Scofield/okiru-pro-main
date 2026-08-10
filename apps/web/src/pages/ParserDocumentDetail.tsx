import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Download, FileWarning, Loader2 } from "lucide-react";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { ExtractionReviewPane } from "@/components/upload/ExtractionReviewPane";
import { PARSER_STATUS_PRESENTATION, fieldLabel, formatParserValue, type ParserDocumentSummary, type ParserRunDetail } from "@/lib/parserDocuments";

export default function ParserDocumentDetail({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const [document, setDocument] = useState<ParserDocumentSummary | null>(null);
  const [run, setRun] = useState<ParserRunDetail | null>(null);
  const [runs, setRuns] = useState<ParserRunDetail[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/parser-documents/${encodeURIComponent(id)}`, { credentials: "include", signal: controller.signal }),
      fetch(`/api/parser-documents/${encodeURIComponent(id)}/runs`, { credentials: "include", signal: controller.signal }),
    ]).then(async ([detailRes, runsRes]) => {
      const detail = await detailRes.json().catch(() => ({}));
      if (!detailRes.ok) throw new Error(detail?.message ?? "Could not load document");
      const history = runsRes.ok ? await runsRes.json() : { runs: [] };
      setDocument(detail.document);
      setRun(detail.latestRun);
      setRuns(history.runs ?? []);
      const fileRes = await fetch(`/api/parser-documents/${encodeURIComponent(id)}/download`, { credentials: "include", signal: controller.signal });
      if (fileRes.ok) {
        const blob = await fileRes.blob();
        setPreviewFile(new File([blob], detail.document.filename, { type: detail.document.fileType || blob.type }));
      }
    }).catch((caught) => {
      if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "Could not load document");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  const fields = (run?.parserOutput?.extracted_fields ?? {}) as Record<string, any>;
  const missingKeys = useMemo(() => new Set([
    ...(run?.missingFields ?? []),
    ...Object.entries(fields).filter(([, field]) => field?.raw_value == null && field?.normalized_value == null).map(([key]) => key),
  ]), [run, fields]);
  const readableFields = Object.entries(fields).filter(([key, field]) => !missingKeys.has(key) && field?.normalized_value != null);
  const missingFields = Object.entries(fields).filter(([key]) => missingKeys.has(key));
  const presentation = run ? PARSER_STATUS_PRESENTATION[run.status] : null;

  const loadRun = async (runId: string) => {
    const res = await fetch(`/api/parser-documents/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`, { credentials: "include" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setRun(body.run);
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-black text-[#8e8e93]"><span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading document</span></div>;
  if (error || !document) return <div className="grid min-h-screen place-items-center bg-black text-red-300"><div className="text-center"><FileWarning className="mx-auto mb-3 h-7 w-7" /><p>{error || "Document not found"}</p><button onClick={() => navigate("/documents")} className="mt-4 text-sm text-white underline">Back to documents</button></div></div>;

  return <div className="min-h-screen bg-black text-[#f5f5f7]">
    <header className="sticky top-0 z-20 h-14 border-b border-[#2c2c2e] bg-black"><div className="flex h-full items-center justify-between px-4 sm:px-6"><div className="flex min-w-0 items-center gap-4"><AppNavBack href="/documents" eyebrow="Library" label="Documents" variant="dark" /><div className="hidden h-5 w-px bg-[#2c2c2e] sm:block" /><span className="truncate text-[14px] font-medium text-white">{document.filename}</span></div><div className="flex items-center gap-2"><a href={`/api/parser-documents/${encodeURIComponent(id)}/download`} title="Download original" className="grid h-9 w-9 place-items-center text-[#d1d1d6] hover:bg-white/[0.06]"><Download className="h-4 w-4" /></a><UserAccountMenu variant="dashboard" /></div></div></header>
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 border-b border-[#2c2c2e] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-[11px] text-[#636366]">{run?.documentType || "Not parsed"}</p><h1 className="mt-1 max-w-4xl text-[24px] font-semibold text-white">{document.filename}</h1><p className="mt-2 text-[12px] text-[#8e8e93]">Uploaded {new Date(document.uploadedAt).toLocaleString("en-ZA")}</p></div>
        <div className="flex flex-wrap items-center gap-5 text-[12px]">{presentation && <span className={`inline-flex items-center gap-2 ${presentation.tone}`}><span className={`h-2 w-2 rounded-full ${presentation.dot}`} />{presentation.description}</span>}<span className="text-[#8e8e93]">Classification confidence <strong className="ml-1 text-white">{run ? `${Math.round(run.overallConfidence * 100)}%` : "Missing"}</strong></span>{runs.length > 1 && <select value={run?.runId} onChange={(event) => void loadRun(event.target.value)} className="h-9 border border-[#38383a] bg-[#1c1c1e] px-3 text-white">{runs.map((item, index) => <option key={item.runId} value={item.runId}>Run {runs.length - index} - {new Date(item.createdAt).toLocaleDateString("en-ZA")}</option>)}</select>}</div>
      </div>

      <ExtractionReviewPane file={previewFile} title={document.filename} className="min-h-[720px]">
        <div className="h-full overflow-y-auto bg-[#111113] p-5 sm:p-6">
          {!run ? <div className="py-16 text-center text-sm text-[#8e8e93]">This file is saved, but no parser run has been recorded yet.</div> : <div className="space-y-8">
            <section><div className="mb-3 flex items-center justify-between"><h2 className="text-[14px] font-semibold text-white">Extracted fields</h2><span className="text-[11px] text-[#636366]">{readableFields.length} read</span></div><div className="divide-y divide-[#2c2c2e] border-y border-[#2c2c2e]">{readableFields.map(([key, field]) => <div key={key} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr_80px]"><div className="text-[12px] text-[#8e8e93]">{fieldLabel(key)}</div><div><p className="break-words text-[13px] text-white">{formatParserValue(field.normalized_value)}</p>{field.source?.text_snippet && <details className="mt-2"><summary className="cursor-pointer text-[11px] text-[#636366]">View source</summary><p className="mt-2 border-l border-[#48484a] pl-3 text-[11px] leading-5 text-[#8e8e93]">{field.source.text_snippet}</p><p className="mt-1 text-[10px] text-[#636366]">{field.source.page != null ? `Page ${field.source.page}` : "Page unavailable"}{field.source.table ? `, ${field.source.table}` : ""}</p></details>}</div><div className={`text-right text-[12px] tabular-nums ${Number(field.confidence) >= 0.85 ? "text-emerald-300" : "text-amber-300"}`}>{Math.round(Number(field.confidence || 0) * 100)}%</div></div>)}</div></section>

            <section><div className="mb-3 flex items-center justify-between"><h2 className="text-[14px] font-semibold text-white">Could not be read</h2><span className="text-[11px] text-[#636366]">{missingFields.length} expected</span></div>{missingFields.length === 0 ? <p className="border-y border-[#2c2c2e] py-4 text-[12px] text-[#8e8e93]">No expected fields are missing.</p> : <div className="divide-y divide-[#3a2f20] border-y border-[#3a2f20]">{missingFields.map(([key]) => <div key={key} className="flex items-center justify-between py-3"><span className="text-[12px] text-[#d1d1d6]">{fieldLabel(key)}</span><span className="text-[11px] text-amber-300">Not found</span></div>)}</div>}</section>

            {(run.lowConfidenceFields?.length > 0 || run.warnings?.length > 0 || run.errors?.length > 0 || run.reviewReasons?.length > 0) && <section><h2 className="mb-3 text-[14px] font-semibold text-white">Warnings and problems</h2><div className="space-y-2">{Array.from(new Set([...run.lowConfidenceFields.map((key) => `${fieldLabel(key)} has low confidence`), ...run.warnings, ...run.errors, ...run.reviewReasons])).map((message) => <div key={message} className="flex gap-3 border-l border-amber-500/50 py-2 pl-3 text-[12px] leading-5 text-[#d1d1d6]"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />{message}</div>)}</div></section>}

            {run.parserOutput?.audit_trail && <section><h2 className="mb-3 text-[14px] font-semibold text-white">Parser audit</h2><dl className="grid gap-3 border-y border-[#2c2c2e] py-4 text-[12px] sm:grid-cols-2"><div><dt className="text-[#636366]">Graph version</dt><dd className="mt-1 text-[#d1d1d6]">{run.graphVersion || "Not recorded"}</dd></div><div><dt className="text-[#636366]">Classification</dt><dd className="mt-1 text-[#d1d1d6]">{run.parserOutput.audit_trail.classification_reason || "No reason recorded"}</dd></div><div className="sm:col-span-2"><dt className="text-[#636366]">Matched evidence</dt><dd className="mt-1 text-[#d1d1d6]">{run.parserOutput.audit_trail.matched_patterns?.join(", ") || "No pattern evidence recorded"}</dd></div></dl></section>}
          </div>}
        </div>
      </ExtractionReviewPane>
    </main>
  </div>;
}
