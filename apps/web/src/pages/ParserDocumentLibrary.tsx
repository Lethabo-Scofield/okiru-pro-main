import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, FileSearch, Loader2, Search, Upload } from "lucide-react";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { PARSER_STATUS_PRESENTATION, type ParserDocumentSummary, type ParserStatus } from "@/lib/parserDocuments";

interface LibraryResponse {
  documents: ParserDocumentSummary[];
  pagination: { page: number; limit: number; total: number; pages: number };
  documentTypes: string[];
}

interface CompanyOption {
  id: string;
  name: string;
}

/** The sentinel the company filter uses for "not filed under any company". */
const UNASSIGNED = "__unassigned__";

export default function ParserDocumentLibrary() {
  const [, navigate] = useLocation();
  const [documents, setDocuments] = useState<ParserDocumentSummary[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [company, setCompany] = useState("");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The saved companies, once — they name the groups the library files
  // documents under, and populate both the filter and the per-row assign.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/clients", { credentials: "include" });
        if (!res.ok) return;
        const rows = (await res.json()) as Array<{ clientId?: string; id?: string; name?: string }>;
        if (Array.isArray(rows)) {
          setCompanies(
            rows
              .map((row) => ({ id: String(row.clientId || row.id || ""), name: String(row.name || "Unnamed") }))
              .filter((row) => row.id),
          );
        }
      } catch {
        // The company column degrades to raw ids; the list itself still works.
      }
    })();
  }, []);

  const companyName = useMemo(() => {
    const map = new Map(companies.map((option) => [option.id, option.name]));
    return (id: string | null | undefined) => (id ? map.get(id) ?? id : null);
  }, [companies]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      if (documentType) params.set("documentType", documentType);
      if (company === UNASSIGNED) params.set("unassigned", "true");
      else if (company) params.set("entityId", company);
      try {
        const res = await fetch(`/api/parser-documents?${params}`, { credentials: "include", signal: controller.signal });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message ?? "Could not load documents");
        const data = body as LibraryResponse;
        setDocuments(data.documents ?? []);
        setTypes(data.documentTypes ?? []);
        setPagination(data.pagination ?? { page, limit: 25, total: 0, pages: 0 });
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "Could not load documents");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, status, documentType, company, page]);

  /** File a document under a company (or unfile it) from the list itself. */
  const assignCompany = async (documentId: string, entityId: string | null) => {
    const previous = documents;
    // Optimistic — the row updates immediately; a failed PATCH puts it back.
    setDocuments((rows) => rows.map((row) => (row.id === documentId ? { ...row, entityId } : row)));
    try {
      const res = await fetch(`/api/parser-documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDocuments(previous);
      setError("Could not move that document — try again.");
    }
  };

  const counts = useMemo(() => ({
    shown: documents.length,
    review: documents.filter((document) => document.status === "review_required").length,
    problem: documents.filter((document) => document.status === "failed").length,
  }), [documents]);

  return (
    <div className="min-h-screen bg-black text-[#f5f5f7]">
      <header className="sticky top-0 z-20 h-14 border-b border-[#2c2c2e] bg-black">
        <div className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <AppNavBack href="/hub" eyebrow="Suite" label="Hub" variant="dark" />
            <div className="hidden h-5 w-px bg-[#2c2c2e] sm:block" />
            <span className="text-[15px] font-semibold text-white">Document Library</span>
          </div>
          <UserAccountMenu variant="dashboard" />
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold text-white">Parsed documents</h1>
            <p className="mt-1 text-[14px] text-[#8e8e93]">Original files and every parser result saved for your workspace.</p>
          </div>
          <button onClick={() => navigate("/create-scorecard")} className="inline-flex h-10 items-center gap-2 bg-white px-4 text-[13px] font-semibold text-black hover:bg-[#e5e5e7]">
            <Upload className="h-4 w-4" /> Upload documents
          </button>
        </div>

        <div className="mb-5 grid grid-cols-3 border-y border-[#2c2c2e] py-4">
          <div><p className="text-[11px] text-[#636366]">Total</p><p className="mt-1 text-xl font-semibold">{pagination.total}</p></div>
          <div><p className="text-[11px] text-[#636366]">Needs review on page</p><p className="mt-1 text-xl font-semibold text-amber-300">{counts.review}</p></div>
          <div><p className="text-[11px] text-[#636366]">Problems on page</p><p className="mt-1 text-xl font-semibold text-red-300">{counts.problem}</p></div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_240px_200px_220px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#636366]" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search filename" className="h-10 w-full border border-[#38383a] bg-[#1c1c1e] pl-10 pr-3 text-[13px] text-white outline-none focus:border-[#636366]" />
          </label>
          {/* The company view is the point of the library: evidence belongs to
              a company, and this is how a verifier works — one client at a
              time, not one big pile. */}
          <select value={company} onChange={(event) => { setCompany(event.target.value); setPage(1); }} className="h-10 border border-[#38383a] bg-[#1c1c1e] px-3 text-[13px] text-white outline-none" data-testid="library-company-filter">
            <option value="">All companies</option>
            <option value={UNASSIGNED}>Not filed under a company</option>
            {companies.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 border border-[#38383a] bg-[#1c1c1e] px-3 text-[13px] text-white outline-none">
            <option value="">All statuses</option><option value="passed">Good</option><option value="review_required">Needs review</option><option value="failed">Problem</option>
          </select>
          <select value={documentType} onChange={(event) => { setDocumentType(event.target.value); setPage(1); }} className="h-10 border border-[#38383a] bg-[#1c1c1e] px-3 text-[13px] text-white outline-none">
            <option value="">All document types</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>

        {error ? <div className="border-y border-red-900/60 py-8 text-sm text-red-300">{error}</div> : loading ? (
          <div className="flex items-center justify-center py-24 text-[#8e8e93]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading documents</div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-center"><FileSearch className="mb-4 h-8 w-8 text-[#636366]" /><p className="font-medium text-white">No parsed documents found</p><p className="mt-1 text-sm text-[#8e8e93]">Upload documents from Create Scorecard to build your library.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left">
              <thead className="sticky top-14 z-10 bg-black text-[11px] text-[#636366]"><tr className="border-b border-[#38383a]"><th className="py-3 pr-5 font-medium">Document</th><th className="px-4 py-3 font-medium">Company</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Confidence</th><th className="px-4 py-3 font-medium">Fields</th><th className="pl-4 py-3 font-medium">Uploaded</th></tr></thead>
              <tbody>{documents.map((document) => {
                const presentation = document.status ? PARSER_STATUS_PRESENTATION[document.status as ParserStatus] : null;
                return <tr key={document.id} onClick={() => navigate(`/documents/${document.id}`)} className="cursor-pointer border-b border-[#242426] text-[13px] hover:bg-white/[0.035]">
                  <td className="max-w-[360px] py-4 pr-5"><p className="truncate font-medium text-white">{document.filename}</p><p className="mt-1 text-[11px] text-[#636366]">{Math.max(1, Math.round(document.fileSize / 1024))} KB</p></td>
                  <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                    {/* Filing lives on the row: misfiled or unowned evidence is
                        fixed where it is seen, not on a separate admin screen. */}
                    <select
                      value={document.entityId ?? ""}
                      onChange={(event) => void assignCompany(document.id, event.target.value || null)}
                      className={`h-8 max-w-[200px] truncate border border-[#38383a] bg-[#1c1c1e] px-2 text-[12px] outline-none focus:border-[#636366] ${document.entityId ? "text-[#d1d1d6]" : "text-amber-300"}`}
                      title={document.entityId ? `Filed under ${companyName(document.entityId)}` : "Not filed under a company yet"}
                      data-testid={`library-assign-${document.id}`}
                    >
                      <option value="">Not filed</option>
                      {companies.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                      {/* A linked company that is not in the picker (deleted, or
                          another teammate's) still shows rather than blanking. */}
                      {document.entityId && !companies.some((option) => option.id === document.entityId) && (
                        <option value={document.entityId}>{document.entityId}</option>
                      )}
                    </select>
                  </td>
                  <td className="px-4 py-4 text-[#d1d1d6]">{document.documentType || "Not parsed"}</td>
                  <td className="px-4 py-4">{presentation ? <span className={`inline-flex items-center gap-2 ${presentation.tone}`}><span className={`h-1.5 w-1.5 rounded-full ${presentation.dot}`} />{presentation.label}</span> : <span className="text-[#636366]">Pending</span>}</td>
                  <td className="px-4 py-4 tabular-nums text-[#d1d1d6]">{document.overallConfidence == null ? "Missing" : `${Math.round(document.overallConfidence * 100)}%`}</td>
                  <td className="px-4 py-4 text-[#d1d1d6]">{document.extractedFieldCount} read{document.problemFieldCount > 0 && <span className="ml-2 text-amber-300">{document.problemFieldCount} problem</span>}</td>
                  <td className="pl-4 py-4 text-[#8e8e93]">{new Date(document.uploadedAt).toLocaleDateString("en-ZA")}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && <div className="mt-6 flex items-center justify-between border-t border-[#2c2c2e] pt-4 text-[12px] text-[#8e8e93]"><span>Page {pagination.page} of {pagination.pages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} title="Previous page" className="grid h-9 w-9 place-items-center border border-[#38383a] disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)} title="Next page" className="grid h-9 w-9 place-items-center border border-[#38383a] disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div></div>}
      </main>
    </div>
  );
}
