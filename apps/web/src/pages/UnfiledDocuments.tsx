import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ChevronLeft, FileSearch, Loader2 } from "lucide-react";
import {
  PARSER_STATUS_PRESENTATION,
  type ParserDocumentSummary,
  type ParserStatus,
} from "@/lib/parserDocuments";

/**
 * Evidence that belongs to nobody yet.
 *
 * Filing lives here and only here. Inside a company's library every document
 * already belongs to that company, so offering a "move to another client"
 * dropdown on each row there is an invitation to misfile someone's evidence
 * with one stray click. Here it is the whole job, so it is the whole page.
 */

interface LibraryResponse {
  documents: ParserDocumentSummary[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

interface CompanyOption {
  id: string;
  name: string;
}

export default function UnfiledDocuments() {
  const [, navigate] = useLocation();
  const [documents, setDocuments] = useState<ParserDocumentSummary[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filing, setFiling] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/clients", { credentials: "include" });
        if (!res.ok) return;
        const rows = (await res.json()) as Array<{ clientId?: string; id?: string; name?: string }>;
        if (Array.isArray(rows)) {
          setCompanies(
            rows
              .map((r) => ({ id: String(r.clientId || r.id || ""), name: String(r.name || "Unnamed") }))
              .filter((r) => r.id)
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      } catch {
        // Filing still works by id if the names never arrive.
      }
    })();
  }, []);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/parser-documents?unassigned=true&limit=100", {
          credentials: "include",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { message?: string })?.message ?? "Could not load documents");
        setDocuments((body as LibraryResponse).documents ?? []);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load documents");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * File one document under a company.
   *
   * The row leaves the list on success, because this page is a queue: what is
   * left is what still needs doing. On failure it stays, with the reason —
   * silently dropping it would claim work that did not happen.
   */
  const file = async (documentId: string, entityId: string) => {
    if (!entityId) return;
    setFiling(documentId);
    try {
      const res = await fetch(`/api/parser-documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId }),
      });
      if (!res.ok) throw new Error("Could not file that document");
      setDocuments((rows) => rows.filter((row) => row.id !== documentId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not file that document");
    } finally {
      setFiling(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ok-eyebrow">Documents</p>
          <h1 className="ok-title-lg mt-1">Not filed under a company</h1>
          <p className="ok-subtitle mt-1.5">
            These were read but never attached to a client. Choose the company each belongs to and
            it moves into that company's library.
          </p>
        </div>
        <button type="button" onClick={() => navigate("/documents")} className="ok-btn">
          <ChevronLeft className="h-4 w-4" /> All companies
        </button>
      </div>

      {error && (
        <div className="ok-panel mb-4 flex items-center gap-3 text-[13px] text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-[color:var(--body)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading documents
        </div>
      ) : documents.length === 0 ? (
        <div className="ok-panel flex flex-col items-center py-16 text-center">
          <FileSearch className="mb-4 h-8 w-8 text-[color:var(--muted)]" />
          <p className="font-medium text-[color:var(--hi)]">Everything is filed</p>
          <p className="ok-subtitle mt-1">No documents are waiting to be attached to a company.</p>
        </div>
      ) : (
        <div className="ok-panel ok-panel-flush overflow-x-auto">
          <table className="ok-table w-full min-w-[820px]">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th>File under</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => {
                const presentation = document.status
                  ? PARSER_STATUS_PRESENTATION[document.status as ParserStatus]
                  : null;
                return (
                  <tr key={document.id} data-testid={`unfiled-${document.id}`}>
                    <td className="max-w-[340px]">
                      <button
                        type="button"
                        onClick={() => navigate(`/documents/${document.id}`)}
                        className="truncate text-left font-medium text-[color:var(--hi)] hover:underline"
                      >
                        {document.filename}
                      </button>
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
                    <td className="text-[color:var(--body)]">
                      {new Date(document.uploadedAt).toLocaleDateString("en-ZA")}
                    </td>
                    <td>
                      <select
                        defaultValue=""
                        disabled={filing === document.id}
                        onChange={(event) => void file(document.id, event.target.value)}
                        className="ok-input h-9 max-w-[220px] truncate"
                        data-testid={`unfiled-assign-${document.id}`}
                      >
                        <option value="">Choose a company…</option>
                        {companies.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
