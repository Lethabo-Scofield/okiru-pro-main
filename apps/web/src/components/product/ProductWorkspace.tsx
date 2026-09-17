import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  Loader2,
  Search,
  Building2,
  FolderOpen,
  FileUp,
  FileSpreadsheet,
  PencilLine,
  Users,
  Award,
  Leaf,
} from 'lucide-react';
import { DeleteCompanyButton } from '@/components/DeleteCompanyButton';
import { API_BASE } from '@toolkit/lib/config';
import {
  esgCreateHref,
  esgSummaryHref,
  esgToolkitHref,
  setEsgActiveCompany,
} from '@/lib/esgRoutes';

export type Product = 'bbbee' | 'esg';

/**
 * The consultant's workspace for ONE product: the companies they carry, and the
 * ways into each.
 *
 * It replaces a single list holding both products behind a dropdown. Consultants
 * work across many companies and asked to "see the list of companies I work
 * with" after choosing a product — one mixed list with a filter reads as one
 * product that happens to have a filter, which is what made the two hard to tell
 * apart. Same component, mounted twice, so the two never drift again.
 */
interface ClientRow {
  clientId: string;
  id?: string;
  name: string;
  industrySector?: string;
  sectorCode?: string;
  scorecardType?: string;
  updatedAt?: string;
  createdByUserId?: string | null;
  /** "bbbee" | "esg" — which product created the company (server-classified). */
  product?: string;
}

interface Company {
  id: string;
  name: string;
  sector: string;
  scorecardType: string;
  updatedAt?: string;
  createdByUserId?: string | null;
}

const COPY: Record<Product, { title: string; eyebrow: string; lead: string; empty: string }> = {
  bbbee: {
    title: 'B-BBEE',
    eyebrow: 'Workspace',
    lead: 'The companies you measure for B-BBEE.',
    empty: 'No B-BBEE companies yet.',
  },
  esg: {
    title: 'ESG',
    eyebrow: 'Workspace',
    lead: 'The companies you report on for ESG.',
    empty: 'No ESG companies yet.',
  },
};

/**
 * The three ways into a scorecard. Identical for both products — same order,
 * same wording, same stated cost — because they are the same decision.
 */
const START_ROUTES = [
  {
    id: 'documents',
    title: 'Upload documents',
    icon: FileUp,
    description: 'We read your evidence and fill the workbook from it.',
    cost: 'Uses tokens',
  },
  {
    id: 'excel',
    title: 'Import a workbook',
    icon: FileSpreadsheet,
    description: 'Bring an Excel workbook you have already filled in.',
    cost: 'Free',
  },
  {
    id: 'manual',
    title: 'Enter it yourself',
    icon: PencilLine,
    description: 'Open an empty workbook and complete each section.',
    cost: 'Free',
  },
] as const;

/** "12 Mar 2026", or empty when the timestamp is missing or unreadable. */
function updatedLabel(iso: string | undefined): string {
  if (!iso) return '';
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ProductWorkspace({ product }: { product: Product }) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const isEsg = product === 'esg';
  const copy = COPY[product];
  const createHref = isEsg ? '/esg/new' : '/bbbee/new';
  // Each product keeps the colour it already has in its toolkit, used to mark
  // which workspace you are in rather than to decorate it.
  const accent = isEsg
    ? {
        chip: 'bg-teal-500/[0.12] text-teal-300 ring-1 ring-inset ring-teal-400/25',
        rule: 'bg-teal-400/60',
      }
    : {
        chip: 'bg-violet-500/[0.12] text-violet-300 ring-1 ring-inset ring-violet-400/25',
        rule: 'bg-violet-400/60',
      };

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch(`${API_BASE}/api/clients`, { credentials: 'include' });
      if (!res.ok) throw new Error(`clients ${res.status}`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch {
      // An empty table and a broken request look identical otherwise, and
      // "you have no companies" is the more alarming of the two to read wrongly.
      setLoadFailed(true);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchClients();
  }, [fetchClients]);

  const companies = useMemo<Company[]>(
    () =>
      clients
        .filter((c) => (c.product === 'esg') === isEsg)
        .map((c) => ({
          id: c.clientId || c.id || '',
          name: c.name || 'Unnamed company',
          // An ESG company's sectorCode is the B-BBEE creation default (RCOGP),
          // not a fact anyone chose — showing it here misfiled the company.
          sector: isEsg ? '—' : c.industrySector || c.sectorCode || 'Other',
          scorecardType: isEsg ? 'ESG' : c.scorecardType || '—',
          updatedAt: c.updatedAt,
          createdByUserId: c.createdByUserId,
        })),
    [clients, isEsg],
  );

  const sectors = useMemo(
    () => Array.from(new Set(companies.map((c) => c.sector).filter((s) => s !== '—'))).sort(),
    [companies],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false;
      if (sectorFilter !== 'all' && c.sector !== sectorFilter) return false;
      return true;
    });
  }, [companies, search, sectorFilter]);

  const openWorkbook = (id: string) => {
    if (isEsg) {
      setEsgActiveCompany(id);
      navigate(esgCreateHref(id));
      return;
    }
    localStorage.setItem('okiru-pro-active-client', id);
    sessionStorage.setItem('okiru-workbook-from', 'saved-companies');
    navigate(`/create-scorecard/${encodeURIComponent(id)}`);
  };

  const openSummary = (id: string) => {
    if (isEsg) {
      setEsgActiveCompany(id);
      navigate(esgSummaryHref(id));
      return;
    }
    localStorage.setItem('okiru-pro-active-client', id);
    navigate(`/create-scorecard/${encodeURIComponent(id)}/summary`);
  };

  const openToolkit = (id: string) => {
    if (isEsg) {
      setEsgActiveCompany(id);
      navigate(esgToolkitHref(id));
      return;
    }
    localStorage.setItem('okiru-pro-active-client', id);
    sessionStorage.setItem(
      'okiru-toolkit-from',
      JSON.stringify({ kind: 'company', companyId: id }),
    );
    navigate('/toolkit/scorecard');
  };

  /** Every company's evidence, filed under that company. */
  const openDocuments = (id: string) =>
    navigate(`/documents?entityId=${encodeURIComponent(id)}`);

  const rowAction =
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-[#e5e5e7] text-[12px] font-medium transition-colors';

  return (
    // The shell draws the rail, the breadcrumbs and the account menu; this page
    // draws what is underneath them.
    <div className="font-sans" data-testid={`workspace-${product}`}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-7">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`grid h-8 w-8 place-items-center rounded-lg ${accent.chip}`}>
                {isEsg ? <Leaf className="h-4 w-4" /> : <Award className="h-4 w-4" />}
              </span>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
                {copy.title} workspace
              </h1>
            </div>
            <p className="text-[13px] text-[#98989f] mt-2">{copy.lead}</p>
          </div>

          {/* A workspace is a team's, so the people in it and the evidence they
              have gathered belong here rather than in a menu somewhere else. */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/access')}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2c2c2e] bg-[#1c1c1e] px-3 py-1.5 text-[12px] font-medium text-[#e5e5e7] hover:border-[#48484a] transition-colors"
              data-testid="workspace-team"
            >
              <Users className="h-3.5 w-3.5" />
              Team &amp; access
            </button>
            <button
              type="button"
              onClick={() => navigate('/documents')}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2c2c2e] bg-[#1c1c1e] px-3 py-1.5 text-[12px] font-medium text-[#e5e5e7] hover:border-[#48484a] transition-colors"
              data-testid="workspace-documents"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Documents
            </button>
          </div>
        </div>

        {/*
          Starting a scorecard is the workspace's own job, not a button that
          sends you somewhere else to be asked how. The three ways in are the
          same three for both products, in the same order, with the cost of
          each stated before it is chosen.
        */}
        <section className="mb-8" aria-labelledby="start-heading">
          <h2
            id="start-heading"
            className="text-[11px] font-semibold uppercase tracking-wider text-[#636366] mb-2"
          >
            Start a scorecard
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {START_ROUTES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(`${createHref}?start=${r.id}`)}
                className="group flex flex-col items-start gap-1 rounded-lg border border-[#2c2c2e] bg-[#1c1c1e] px-4 py-3.5 text-left hover:border-[#48484a] transition-colors"
                data-testid={`start-${r.id}`}
              >
                <span className="flex items-center gap-2 text-white">
                  <r.icon className="h-4 w-4 text-[#98989f]" />
                  <span className="text-[13px] font-medium">{r.title}</span>
                </span>
                <span className="text-[12px] text-[#8e8e93]">{r.description}</span>
                <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#636366]">
                  {r.cost}
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#636366]" />
            <input
              type="text"
              placeholder="Search companies"
              aria-label="Search companies"
              className="w-full rounded-lg bg-[#1c1c1e] border border-[#2c2c2e] pl-9 pr-3 py-2 text-[13px] text-white outline-none focus:border-[#48484a] transition-colors placeholder:text-[#48484a]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-company-search"
            />
          </div>
          {sectors.length > 0 && (
            <select
              aria-label="Filter by sector"
              className="rounded-lg bg-[#1c1c1e] border border-[#2c2c2e] px-3 py-2 text-[13px] text-[#d1d1d6] outline-none focus:border-[#48484a] transition-colors"
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              data-testid="select-sector"
            >
              <option value="all">All sectors</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="rounded-xl border border-[#2c2c2e] bg-[#1c1c1e] overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-[#2c2c2e]">
            <span className="text-[12px] font-semibold text-white">Companies</span>
            <span className="text-[11px] text-[#98989f]" data-testid="results-count">
              {loading ? '' : `${visible.length} shown`}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2.5">
              <Loader2 className="w-4 h-4 text-[#636366] animate-spin" />
              <span className="text-[13px] text-[#8e8e93]">Loading companies</span>
            </div>
          ) : loadFailed ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-[13px] text-[#98989f]">Could not load your companies.</p>
              <button
                onClick={() => void fetchClients()}
                className="text-[13px] text-white underline underline-offset-4"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] text-[#98989f] uppercase tracking-wider border-b border-[#2c2c2e]">
                    <th className="px-4 py-2 font-semibold">Company</th>
                    {!isEsg && <th className="px-4 py-2 font-semibold">Sector</th>}
                    <th className="px-4 py-2 font-semibold">Type</th>
                    <th className="px-4 py-2 font-semibold">Updated</th>
                    <th className="px-4 py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2c2c2e]">
                  {visible.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-white/[0.02] transition-colors"
                      data-testid={`company-row-${c.id}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openSummary(c.id)}
                          className="font-medium text-white hover:underline underline-offset-4 text-left"
                        >
                          {c.name}
                        </button>
                        <div className="text-[11px] text-[#636366] mt-0.5">{c.id}</div>
                      </td>
                      {!isEsg && <td className="px-4 py-3 text-[#8e8e93]">{c.sector}</td>}
                      <td className="px-4 py-3 text-[#8e8e93]">{c.scorecardType}</td>
                      <td className="px-4 py-3 text-[#8e8e93] tabular-nums">
                        {updatedLabel(c.updatedAt) || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openDocuments(c.id)}
                            className={rowAction}
                            data-testid={`button-documents-${c.id}`}
                            title="Documents filed under this company"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            Documents
                          </button>
                          <button
                            onClick={() => openWorkbook(c.id)}
                            className={rowAction}
                            data-testid={`button-workbook-${c.id}`}
                          >
                            Workbook
                          </button>
                          <button
                            onClick={() => openToolkit(c.id)}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-white text-black text-[12px] font-semibold hover:bg-[#e5e5e7] transition-colors"
                            data-testid={`button-scorecard-${c.id}`}
                          >
                            {isEsg ? 'Open toolkit' : 'Scorecard'}
                          </button>
                          <DeleteCompanyButton
                            companyId={c.id}
                            companyName={c.name}
                            createdByUserId={c.createdByUserId}
                            onDeleted={fetchClients}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={isEsg ? 4 : 5} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Building2 className="w-7 h-7 text-[#3a3a3c]" />
                          <p className="text-[13px] text-[#8e8e93]">
                            {companies.length === 0 ? copy.empty : 'No companies match that search.'}
                          </p>
                          {companies.length === 0 && (
                            <button
                              onClick={() => navigate(createHref)}
                              className="text-[13px] text-white underline underline-offset-4"
                            >
                              Create the first one
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductWorkspace;
