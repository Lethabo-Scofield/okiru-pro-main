import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  FileSearch,
  FolderOpen,
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
 * Evidence, filed the way the work is done: per company.
 *
 * This was one flat table of everything the organisation had ever uploaded,
 * with the company as a *column* and a dropdown to narrow it down. That is a
 * filing cabinet with the drawers removed — a consultant carrying twenty
 * clients had to re-apply a filter to see any one of them, and two clients'
 * evidence sat interleaved on the same page.
 *
 * So there are two views now, and no flat pile:
 *
 *   - the index: one container per company, holding that company's evidence
 *     and nothing else, with what is filed and what still needs looking at;
 *   - the company library: one client's documents, reached from its row in the
 *     workspace, which is where the question "what have we got for them?"
 *     actually gets asked.
 *
 * Documents nobody has filed yet get a container of their own rather than
 * being hidden — unfiled evidence is a job to do, not an absence.
 */

interface LibraryResponse {
  documents: ParserDocumentSummary[];
  pagination: { page: number; limit: number; total: number; pages: number };
  documentTypes: string[];
}

export interface CompanyOption {
  id: string;
  name: string;
  /** "bbbee" | "esg" — decides the colour and which section it lives under. */
  product?: string;
}

/** The sentinel for "not filed under any company". */
const UNASSIGNED = "__unassigned__";

const PRODUCT_LABEL: Record<string, string> = { bbbee: "B-BBEE", esg: "ESG" };

function productAccent(product: string | undefined): string {
  return product === "esg" ? "var(--esg)" : "var(--bbbee)";
}

/** Where a company's own library lives, under its product's section. */
export function companyDocumentsHref(company: CompanyOption): string {
  // Written as two whole paths rather than a variable prefix plus segments:
  // a path whose first segment is a variable cannot be checked against the
  // route table, and that is exactly how /bbbee/new/C-98220 shipped as a 404.
  const id = encodeURIComponent(company.id);
  return company.product === "esg" ? `/esg/${id}/documents` : `/bbbee/${id}/documents`;
}

function useCompanies() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/clients", { credentials: "include" });
        if (!res.ok) return;
        const rows = (await res.json()) as Array<{
          clientId?: string;
          id?: string;
          name?: string;
          product?: string;
        }>;
        if (Array.isArray(rows)) {
          setCompanies(
            rows
              .map((row) => ({
                id: String(row.clientId || row.id || ""),
                name: String(row.name || "Unnamed"),
                product: row.product,
              }))
              .filter((row) => row.id)
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      } catch {
        // The library still works without names; ids stand in.
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  return { companies, loaded };
}

// ------------------------------------------------------------------ index --

interface Tally {
  total: number;
  review: number;
  problem: number;
}

/**
 * How many documents each company has, and how many need a person.
 *
 * Asked per company rather than by paging the whole pile, because the counts
 * have to be exact: "3 need review" is a to-do list, and a number that only
 * counts the current page is worse than no number at all.
 */
function useTallies(companies: CompanyOption[], ready: boolean) {
  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();

    void (async () => {
      const ask = async (params: string): Promise<number> => {
        try {
          const res = await fetch(`/api/parser-documents?${params}&limit=1`, {
            credentials: "include",
            signal: controller.signal,
          });
          if (!res.ok) return 0;
          const body = (await res.json()) as LibraryResponse;
          return body.pagination?.total ?? 0;
        } catch {
          return 0;
        }
      };

      const targets = [
        ...companies.map((c) => ({ key: c.id, scope: `entityId=${encodeURIComponent(c.id)}` })),
        { key: UNASSIGNED, scope: "unassigned=true" },
      ];

      const rows = await Promise.all(
        targets.map(async ({ key, scope }) => {
          const [total, review, problem] = await Promise.all([
            ask(scope),
            ask(`${scope}&status=review_required`),
            ask(`${scope}&status=failed`),
          ]);
          return [key, { total, review, problem }] as const;
        }),
      );

      if (!controller.signal.aborted) {
        setTallies(Object.fromEntries(rows));
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [companies, ready]);

  return { tallies, loading };
}

function CompanyCard({
  name,
  accent,
  badge,
  tally,
  onOpen,
  testId,
}: {
  name: string;
  accent: string;
  badge?: string;
  tally: Tally | undefined;
  onOpen: () => void;
  testId: string;
}) {
  const total = tally?.total ?? 0;
  const needsAttention = (tally?.review ?? 0) + (tally?.problem ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="ok-panel ok-panel-action group relative flex flex-col gap-3 overflow-hidden p-4 text-left"
      data-testid={testId}
    >
      <span
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ background: accent, opacity: total === 0 ? 0.28 : 0.7 }}
        aria-hidden
      />

      <div className="flex items-center gap-2.5">
        <FolderOpen
          className="h-4 w-4 shrink-0"
          style={{ color: accent, opacity: total === 0 ? 0.5 : 1 }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[color:var(--hi)]">
          {name}
        </span>
        {badge && (
          <span className="ok-eyebrow shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5">
            {badge}
          </span>
        )}
      </div>

      {/* A row of large zeroes is not a dashboard, it is a page shouting that
          it has nothing. The count only takes the eye once there is one. */}
      <div className="flex min-h-[26px] flex-wrap items-center gap-2">
        {total === 0 ? (
          <span className="text-[12px] text-[color:var(--muted)]">Nothing filed yet</span>
        ) : (
          <>
            <span className="ok-num text-[20px] font-semibold leading-none text-[color:var(--hi)]">
              {total}
            </span>
            <span className="text-[12px] text-[color:var(--muted)]">
              document{total === 1 ? "" : "s"}
            </span>
            {tally && tally.review > 0 && (
              <span className="ok-chip ok-chip-warn ml-auto">{tally.review} to review</span>
            )}
            {tally && tally.problem > 0 && (
              <span className="ok-chip ok-chip-bad">{tally.problem} problem</span>
            )}
            {!needsAttention && <span className="ok-chip ok-chip-good ml-auto">All read</span>}
          </>
        )}
        <ChevronRight
          className="ml-auto h-4 w-4 shrink-0 text-[color:var(--muted)] transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </button>
  );
}

/** The index: every company you work with, each holding its own evidence. */
export default function ParserDocumentLibrary() {
  const [, navigate] = useLocation();
  const { companies, loaded } = useCompanies();
  const { tallies, loading } = useTallies(companies, loaded);
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? companies.filter((c) => c.name.toLowerCase().includes(needle)) : companies;
  }, [companies, search]);

  const unfiled = tallies[UNASSIGNED];

  // What the page is actually reporting, said once at the top instead of being
  // left for the reader to add up across a grid of cards.
  const filedTotal = companies.reduce((sum, c) => sum + (tallies[c.id]?.total ?? 0), 0);
  const attentionTotal = companies.reduce(
    (sum, c) => sum + (tallies[c.id]?.review ?? 0) + (tallies[c.id]?.problem ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ok-eyebrow">Documents</p>
          <h1 className="ok-title-lg mt-1">Every company, and its evidence</h1>
          <p className="ok-subtitle mt-1.5 max-w-[560px]">
            Open a company to see what has been read for it. Evidence is filed per company — never
            one shared pile.
          </p>
          {!loading && companies.length > 0 && (
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[color:var(--muted)]">
              <span className="ok-num text-[color:var(--body)]">{companies.length}</span>
              <span>{companies.length === 1 ? "company" : "companies"}</span>
              <span aria-hidden>·</span>
              <span className="ok-num text-[color:var(--body)]">{filedTotal}</span>
              <span>{filedTotal === 1 ? "document filed" : "documents filed"}</span>
              {attentionTotal > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-amber-300">{attentionTotal} needing a person</span>
                </>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate("/bbbee/new?start=documents")}
          className="ok-btn-primary"
          data-testid="library-upload"
        >
          <Upload className="h-4 w-4" /> Upload documents
        </button>
      </div>

      {companies.length > 6 && (
        <label className="relative mb-5 block max-w-[380px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a company"
            className="ok-input ok-input-icon w-full"
            data-testid="library-company-search"
          />
        </label>
      )}

      {!loaded || loading ? (
        <div className="flex items-center justify-center py-24 text-[color:var(--body)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your companies
        </div>
      ) : companies.length === 0 ? (
        <div className="ok-panel flex flex-col items-center py-16 text-center">
          <FileSearch className="mb-4 h-8 w-8 text-[color:var(--muted)]" />
          <p className="font-medium text-[color:var(--hi)]">No companies yet</p>
          <p className="ok-subtitle mt-1">
            Create a scorecard and the documents you upload for it are filed here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((company) => (
              <CompanyCard
                key={company.id}
                name={company.name}
                badge={PRODUCT_LABEL[company.product ?? "bbbee"] ?? "B-BBEE"}
                accent={productAccent(company.product)}
                tally={tallies[company.id]}
                onOpen={() => navigate(companyDocumentsHref(company))}
                testId={`library-company-${company.id}`}
              />
            ))}
          </div>

          {/* Unfiled evidence is a job to do, so it gets a container of its own
              rather than being folded away into "everything else". */}
          {unfiled && unfiled.total > 0 && (
            <div className="mt-6">
              <p className="ok-eyebrow mb-2">Not filed under a company</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <CompanyCard
                  name="Unfiled documents"
                  accent="rgba(255,255,255,0.35)"
                  tally={unfiled}
                  onOpen={() => navigate("/documents/unfiled")}
                  testId="library-company-unfiled"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
