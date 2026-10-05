import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import {
  PARSER_STATUS_PRESENTATION,
  type ParserDocumentSummary,
  type ParserStatus,
} from "@/lib/parserDocuments";

/**
 * One company's evidence.
 *
 * This is where a verifier actually works — one client at a time — so the
 * company is the page, not a filter applied to a shared list. There is no
 * company picker here on purpose: if you are in Acme's library, everything you
 * can see belongs to Acme, and nothing you do can file a document into someone
 * else's client by accident.
 */

interface LibraryResponse {
  documents: ParserDocumentSummary[];
  pagination: { page: number; limit: number; total: number; pages: number };
  documentTypes: string[];
}

interface Company {
  id: string;
  name: string;
  product?: string;
}

export function CompanyDocumentLibrary({
  companyId,
  product,
}: {
  companyId: string;
  /** From the route, so the page is right before the company has loaded. */
  product: "bbbee" | "esg";
}) {
  const [, navigate] = useLocation();
  const [company, setCompany] = useState<Company | null>(null);
  const [documents, setDocuments] = useState<ParserDocumentSummary[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const accent = product === "esg" ? "var(--esg)" : "var(--bbbee)";
  const sectionHref = product === "esg" ? "/esg" : "/bbbee";

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(companyId)}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const row = (await res.json()) as { clientId?: string; id?: string; name?: string; product?: string };
        setCompany({
          id: String(row.clientId || row.id || companyId),
          name: String(row.name || companyId),
          product: row.product,
        });
      } catch {
        // The id stands in for the name; the list below is the point.
      }
    })();
  }, [companyId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        entityId: companyId,
      });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      if (documentType) params.set("documentType", documentType);
      try {
        const res = await fetch(`/api/parser-documents?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { message?: string })?.message ?? "Could not load documents");
        const data = body as LibraryResponse;
        setDocuments(data.documents ?? []);
        setTypes(data.documentTypes ?? []);
        setPagination(data.pagination ?? { page, limit: 25, total: 0, pages: 0 });
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError(caught instanceof Error ? caught.message : "Could not load documents");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [companyId, search, status, documentType, page]);

  const counts = useMemo(
    () => ({
      review: documents.filter((d) => d.status === "review_required").length,
      problem: documents.filter((d) => d.status === "failed").length,
    }),
    [documents],
  );

  const name = company?.name ?? companyId;
  const filtered = Boolean(search.trim() || status || documentType);
  /** Anything at all under this company — not "anything matching the filters". */
  const hasAny = pagination.total > 0 || filtered;

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="ok-eyebrow">{product === "esg" ? "ESG" : "B-BBEE"} · Documents</p>
          <h1 className="ok-title-lg mt-1 flex items-center gap-2.5">
            <span
              className="h-5 w-[3px] shrink-0 rounded-full"
              style={{ background: accent }}
              aria-hidden
            />
            <span className="truncate">{name}</span>
          </h1>
          <p className="ok-subtitle mt-1.5">
            Every document read for this company, and what the parser made of it.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(sectionHref)}
            className="ok-btn"
            data-testid="company-docs-back"
          >
            <ChevronLeft className="h-4 w-4" /> Workspace
          </button>
          {/* Adding evidence to a company that already has a workbook is a
              re-upload, not a new scorecard: it has to land in the workbook
              that exists and say what it would overwrite. That flow is being
              built; until it is, this opens the workbook rather than pointing
              at a page that does not exist yet. */}
          <button
            type="button"
            onClick={() => navigate(`/create-scorecard/${encodeURIComponent(companyId)}`)}
            className="ok-btn-primary"
            data-testid="company-docs-upload"
          >
            <Upload className="h-4 w-4" /> Open workbook
          </button>
        </div>
      </div>

      {/* Three zeroes stretched across a 1400px row was the page's whole content
          on an empty company. Counts appear once there is something to count,
          and they sit inline rather than as a full-width grid of tiles. */}
      {hasAny && (
        <div className="ok-panel-flush mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <span className="ok-num text-[18px] font-semibold text-[color:var(--hi)]">
              {pagination.total}
            </span>
            <span className="text-[12px] text-[color:var(--body)]">filed here</span>
          </div>
          {counts.review > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="ok-num text-[18px] font-semibold text-amber-300">{counts.review}</span>
              <span className="text-[12px] text-[color:var(--body)]">need review on this page</span>
            </div>
          )}
          {counts.problem > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="ok-num text-[18px] font-semibold text-red-300">{counts.problem}</span>
              <span className="text-[12px] text-[color:var(--body)]">with a problem</span>
            </div>
          )}
          {counts.review === 0 && counts.problem === 0 && (
            <span className="ok-chip ok-chip-good">Everything on this page read cleanly</span>
          )}
        </div>
      )}

      {/* Filters are for narrowing a list. With nothing filed they are three
          dead controls above an empty box. */}
      {hasAny && (
      <div className="mb-5 grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_220px]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search filename"
            className="ok-input ok-input-icon w-full"
            data-testid="company-docs-search"
          />
        </label>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="ok-input"
        >
          <option value="">All statuses</option>
          <option value="passed">Good</option>
          <option value="review_required">Needs review</option>
          <option value="failed">Problem</option>
        </select>
        <select
          value={documentType}
          onChange={(event) => {
            setDocumentType(event.target.value);
            setPage(1);
          }}
          className="ok-input"
        >
          <option value="">All document types</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      )}

      {error ? (
        <div className="ok-panel flex items-center gap-3 text-[13px] text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24 text-[color:var(--body)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading documents
        </div>
      ) : documents.length === 0 ? (
        <div className="ok-panel px-6 py-10 text-center sm:px-10">
          <FileSearch className="mx-auto h-7 w-7 text-[color:var(--muted)]" aria-hidden />
          <p className="mt-3 text-[15px] font-medium text-[color:var(--hi)]">
            {filtered ? "No documents match those filters" : `Nothing filed for ${name} yet`}
          </p>
          <p className="ok-subtitle mx-auto mt-1.5 max-w-[420px]">
            {filtered
              ? "Clear the search or the status filter to see everything filed under this company."
              : "Documents uploaded for this company are read, scored and filed here automatically."}
          </p>
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatus("");
                setDocumentType("");
                setPage(1);
              }}
              className="ok-btn mt-5"
            >
              Clear filters
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate(`/create-scorecard/${encodeURIComponent(companyId)}`)}
              className="ok-btn-primary mt-5"
              data-testid="company-docs-empty-upload"
            >
              <Upload className="h-4 w-4" /> Open workbook
            </button>
          )}
        </div>
      ) : (
        <div className="ok-panel ok-panel-flush overflow-x-auto">
          <table className="ok-table w-full min-w-[880px]">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Status</th>
                <th>Confidence</th>
                <th>Fields</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => {
                const presentation = document.status
                  ? PARSER_STATUS_PRESENTATION[document.status as ParserStatus]
                  : null;
                return (
                  <tr
                    key={document.id}
                    onClick={() => navigate(`/documents/${document.id}`)}
                    className="cursor-pointer"
                    data-testid={`company-doc-${document.id}`}
                  >
                    <td className="max-w-[360px]">
                      <p className="truncate font-medium text-[color:var(--hi)]">
                        {document.filename}
                      </p>
                      <p className="mt-1 text-[11px] text-[color:var(--muted)]">
                        {Math.max(1, Math.round(document.fileSize / 1024))} KB
                      </p>
                    </td>
                    <td className="text-[color:var(--body)]">
                      {document.documentType || "Not parsed"}
                    </td>
                    <td>
                      {presentation ? (
                        <span className={`inline-flex items-center gap-2 ${presentation.tone}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${presentation.dot}`} />
                          {presentation.label}
                        </span>
                      ) : (
                        <span className="text-[color:var(--muted)]">Pending</span>
                      )}
                    </td>
                    <td className="ok-num text-[color:var(--body)]">
                      {document.overallConfidence == null
                        ? "Missing"
                        : `${Math.round(document.overallConfidence * 100)}%`}
                    </td>
                    <td className="text-[color:var(--body)]">
                      {document.extractedFieldCount} read
                      {document.problemFieldCount > 0 && (
                        <span className="ml-2 text-amber-300">
                          {document.problemFieldCount} problem
                        </span>
                      )}
                    </td>
                    <td className="text-[color:var(--body)]">
                      {new Date(document.uploadedAt).toLocaleDateString("en-ZA")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-[color:var(--rule)] pt-4 text-[12px] text-[color:var(--body)]">
          <span>
            Page {pagination.page} of {pagination.pages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              title="Previous page"
              className="ok-btn h-9 w-9 justify-center px-0 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((value) => value + 1)}
              title="Next page"
              className="ok-btn h-9 w-9 justify-center px-0 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompanyDocumentLibrary;
