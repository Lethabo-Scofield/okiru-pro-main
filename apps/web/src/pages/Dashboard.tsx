import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import { Loader2, Search, FileText, Building2, ExternalLink, Pencil } from 'lucide-react';
import { AppNavBack } from '@/components/AppNavBack';
import { UserAccountMenu } from '@/components/UserAccountMenu';
import { DeleteCompanyButton } from '@/components/DeleteCompanyButton';
import { API_BASE } from '@toolkit/lib/config';

interface ClientRow {
  clientId: string;
  id?: string;
  name: string;
  industrySector?: string;
  sectorCode?: string;
  scorecardType?: string;
  updatedAt?: string;
  createdByUserId?: string | null;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [companySearch, setCompanySearch] = useState('');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setClients(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const allCompanies = useMemo(() => {
    return clients.map((c) => ({
      id: c.clientId || c.id || '',
      name: c.name || 'Unknown',
      industry: c.industrySector || c.sectorCode || 'Other',
      scorecardType: c.scorecardType || 'â€”',
      updatedAt: c.updatedAt,
      createdByUserId: c.createdByUserId,
    }));
  }, [clients]);

  const industries = useMemo(
    () => Array.from(new Set(allCompanies.map((c) => c.industry))).sort(),
    [allCompanies],
  );

  const filteredCompanies = useMemo(() => {
    let result = allCompanies.slice();
    const q = companySearch.toLowerCase();
    if (q) {
      result = result.filter(
        (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
      );
    }
    if (industryFilter !== 'all') {
      result = result.filter((c) => c.industry === industryFilter);
    }
    return result;
  }, [allCompanies, companySearch, industryFilter]);

  const stats = useMemo(
    () => ({
      total: allCompanies.length,
      industries: industries.length,
      industryList: industries.join(' \u2022 '),
    }),
    [allCompanies, industries],
  );

  const openScorecard = (clientId: string) => {
    localStorage.setItem('okiru-pro-active-client', clientId);
    navigate('/toolkit/scorecard');
  };

  return (
    <div className="font-sans min-h-screen bg-black" style={{ letterSpacing: '-0.011em', color: '#f5f5f7' }}>

      <header className="h-14 shrink-0 z-20 sticky top-0 bg-black" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="w-full px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AppNavBack href="/hub" eyebrow="Suite" label="Hub" variant="dark" className="shrink-0" />
            <div className="w-px h-5 bg-[#2c2c2e] hidden sm:block"></div>
            <div className="flex items-center gap-3">
              <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-[8px]" />
              <span className="text-lg font-semibold tracking-tight text-white border-l border-[#2c2c2e] pl-3">View Scorecard</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <UserAccountMenu variant="dashboard" />
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
          <section data-testid="page-scorecards" className="fade-in">
            <div className="flex items-start justify-between gap-4 mb-8">
              <div>
                <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white">Saved Companies</h1>
                <p className="text-[14px] text-[#98989f] mt-1">Open a scorecard or continue editing a company workbook.</p>
              </div>
              <button
                onClick={() => navigate('/create-scorecard')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.12] hover:bg-white/[0.18] text-white text-[13px] font-semibold smooth press-sm shadow-sm shadow-black/10 shrink-0 mt-2"
                data-testid="button-new-scorecard"
              >
                <FileText className="h-4 w-4" />
                Create Scorecard
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="rounded-2xl bg-[#1c1c1e] p-5 fade-in">
                <div className="text-[10px] text-[#98989f] font-semibold uppercase tracking-wider">Total Companies</div>
                <div className="text-[32px] font-bold mt-1 tracking-[-0.03em] text-white" data-testid="stat-companies">
                  {loadingClients ? <Loader2 className="w-6 h-6 animate-spin text-[#636366] inline-block" /> : stats.total}
                </div>
              </div>
              <div className="rounded-2xl bg-[#1c1c1e] p-5 opacity-0 fade-in stagger-1">
                <div className="text-[10px] text-[#98989f] font-semibold uppercase tracking-wider">Industries</div>
                <div className="text-[32px] font-bold mt-1 tracking-[-0.03em] text-white" data-testid="stat-industries">
                  {loadingClients ? '-' : stats.industries}
                </div>
                <div className="text-[10px] text-[#636366] mt-2">{stats.industryList || 'No companies yet'}</div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#1c1c1e] p-4 mb-5">
              <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-[#98989f] uppercase tracking-wider" htmlFor="companySearch">Search companies</label>
                  <div className="mt-1.5 relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#636366]" />
                    <input
                      id="companySearch"
                      type="text"
                      placeholder="Search by company name or ID..."
                      className="w-full rounded-xl bg-[#2c2c2e] pl-10 pr-4 py-2.5 text-[14px] text-white outline-none focus:ring-2 focus:ring-white/[0.15] smooth placeholder:text-[#48484a]"
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      data-testid="input-company-search"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#98989f] uppercase tracking-wider" htmlFor="industryFilter">Industry</label>
                  <select
                    id="industryFilter"
                    className="mt-1.5 block rounded-xl bg-[#2c2c2e] px-3 py-2.5 text-[13px] text-[#d1d1d6] outline-none focus:ring-2 focus:ring-white/[0.15] smooth"
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                    data-testid="select-industry"
                  >
                    <option value="all">All</option>
                    {industries.map((ind) => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#1c1c1e] overflow-hidden">
              <div className="px-5 py-3.5 flex items-center justify-between">
                <div className="text-[13px] font-semibold text-white">Companies</div>
                <div className="text-[11px] text-[#98989f] font-medium" data-testid="results-count">
                  {loadingClients ? <Loader2 className="w-3 h-3 animate-spin inline-block" /> : `${filteredCompanies.length} result${filteredCompanies.length !== 1 ? 's' : ''}`}
                </div>
              </div>

              {loadingClients ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-6 h-6 text-[#d1d1d6] animate-spin" />
                  <p className="text-[#8e8e93] text-sm">Loading companies...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[13px]">
                    <thead className="bg-white/[0.03]">
                      <tr className="text-left text-[10px] text-[#98989f] uppercase tracking-wider">
                        <th className="px-5 py-2.5 font-semibold">Company</th>
                        <th className="px-5 py-2.5 font-semibold">Industry</th>
                        <th className="px-5 py-2.5 font-semibold">Scorecard Type</th>
                        <th className="px-5 py-2.5 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {filteredCompanies.map((c) => (
                        <tr key={c.id} className="hover:bg-white/[0.03] smooth" data-testid={`company-row-${c.id}`}>
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-white">{c.name}</div>
                            <div className="text-[10px] text-[#636366] mt-0.5">{c.id}</div>
                          </td>
                          <td className="px-5 py-3.5 text-[#8e8e93]">{c.industry}</td>
                          <td className="px-5 py-3.5 text-[#8e8e93]">{c.scorecardType}</td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <DeleteCompanyButton
                                companyId={c.id}
                                companyName={c.name}
                                createdByUserId={c.createdByUserId}
                                onDeleted={fetchClients}
                              />
                              <button
                                onClick={() => {
                                  localStorage.setItem('okiru-pro-active-client', c.id);
                                  navigate(`/create-scorecard/${encodeURIComponent(c.id)}/summary`);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-semibold smooth press-sm"
                                data-testid={`button-summary-${c.id}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                                Summary
                              </button>
                              <button
                                onClick={() => openScorecard(c.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.12] hover:bg-white/[0.18] text-white text-[12px] font-semibold smooth press-sm"
                                data-testid={`button-scorecard-${c.id}`}
                              >
                                View Scorecard
                              </button>
                              <button
                                onClick={() => {
                                  sessionStorage.setItem('okiru-workbook-from', 'saved-companies');
                                  navigate(`/create-scorecard/${encodeURIComponent(c.id)}`);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.12] hover:bg-white/[0.18] text-white text-[12px] font-semibold smooth press-sm"
                                data-testid={`button-workbook-${c.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                                Edit Workbook
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredCompanies.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-5 py-16 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <Building2 className="w-8 h-8 text-[#3a3a3c]" />
                              <p className="text-[14px] text-[#636366]">No companies yet</p>
                              <button
                                onClick={() => navigate('/create-scorecard')}
                                className="text-[13px] text-[#d1d1d6] hover:text-[#e5e5e7] font-medium smooth"
                              >
                                Create your first scorecard â†’
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
      </main>
    </div>
  );
}
