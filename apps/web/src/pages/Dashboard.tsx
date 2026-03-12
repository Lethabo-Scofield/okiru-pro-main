import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@toolkit/lib/auth';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import { Trash2, Loader2, LogOut, Pencil, ChevronLeft, Search, ChevronRight, Plus, FileText, Building2, Sparkles } from 'lucide-react';
import { starterTemplates as staticTemplates } from '@/data/starterTemplates';

interface StoredTemplate {
  id: number;
  name: string;
  description: string;
  version: string;
  entities: { label: string; definition: string; synonyms?: string[]; zones?: string[]; keywords?: any; pattern?: string; positives?: string[]; negatives?: string[] }[];
  createdAt: string;
  updatedAt: string;
}

const companies = [
  { name: "Moyo Retail (Pty) Ltd", id: "C-10483", industry: "Retail", status: "new" as const },
  { name: "Karoo Telecom", id: "C-21907", industry: "Telecoms", status: "in_progress" as const },
  { name: "Umhlaba Insurance Group", id: "C-88712", industry: "Insurance", status: "compliant" as const },
  { name: "Aurum Financial Services", id: "C-54011", industry: "Financial Services", status: "in_progress" as const },
  { name: "Blue Crane Logistics", id: "C-66309", industry: "Logistics", status: "new" as const },
  { name: "Saffron Health Network", id: "C-77201", industry: "Healthcare", status: "compliant" as const },
  { name: "Vula Energy Partners", id: "C-30118", industry: "Energy", status: "new" as const },
  { name: "CapeTech Manufacturing", id: "C-91145", industry: "Manufacturing", status: "in_progress" as const },
];

type Page = 'home' | 'templates' | 'scorecards';

function statusLabel(status: string) {
  if (status === "new") return "New";
  if (status === "in_progress") return "In Progress";
  if (status === "compliant") return "Compliant";
  return status;
}

function statusPillClass(status: string) {
  const base = "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium";
  if (status === "compliant") return `${base} bg-emerald-500/15 text-emerald-400`;
  if (status === "in_progress") return `${base} bg-amber-500/15 text-amber-400`;
  return `${base} bg-white/[0.06] text-[#8e8e93]`;
}

const categoryColor: Record<string, string> = {
  "B-BBEE": "bg-emerald-500/15 text-emerald-400",
  Finance: "bg-purple-500/15 text-purple-400",
  Compliance: "bg-purple-500/10 text-purple-400",
  Governance: "bg-indigo-500/15 text-indigo-400",
  Corporate: "bg-white/[0.06] text-[#8e8e93]",
};

export default function Dashboard() {
  const [page, setPage] = useState<Page>('home');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading, logout } = useAuth();
  const [templateSearch, setTemplateSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [industryFilter, setIndustryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [storedTemplates, setStoredTemplates] = useState<StoredTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [publishingKey, setPublishingKey] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/templates");
      if (res.ok) setStoredTemplates(await res.json());
    } catch (err) {
      console.error("Error fetching templates:", err);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const useTemplate = useCallback(async (template: typeof staticTemplates[0]) => {
    if (publishingKey) return;
    setPublishingKey(template.key);
    try {
      const templateEntities = template.entities.map(e => ({
        label: e.label, definition: e.definition, synonyms: e.synonyms,
        positives: e.positives, negatives: e.negatives, zones: e.zones,
        keywords: e.keywords, pattern: e.pattern,
      }));
      const freshRes = await fetch("/api/templates");
      const freshTemplates: StoredTemplate[] = freshRes.ok ? await freshRes.json() : [];
      const existing = freshTemplates.find(t => t.name === template.name);
      const url = existing ? `/api/templates/${existing.id}` : "/api/templates";
      const method = existing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: template.name, description: template.description, version: "1.0", entities: templateEntities }),
      });
      if (!res.ok) throw new Error("Failed to publish");
      await fetchTemplates();
      toast({ title: "Template ready", description: `"${template.name}" published — select it in Document Processor` });
      navigate("/processor");
    } catch (err) {
      console.error("Error publishing starter template:", err);
      toast({ title: "Publish failed", description: "Could not save template to repository", variant: "destructive" });
    } finally {
      setPublishingKey(null);
    }
  }, [publishingKey, fetchTemplates, toast, navigate]);

  const industries = useMemo(() => Array.from(new Set(companies.map(c => c.industry))).sort(), []);

  const filteredCompanies = useMemo(() => {
    let result = companies.slice();
    const q = companySearch.toLowerCase();
    if (q) result = result.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    if (industryFilter !== 'all') result = result.filter(c => c.industry === industryFilter);
    if (statusFilter !== 'all') result = result.filter(c => c.status === statusFilter);
    return result;
  }, [companySearch, industryFilter, statusFilter]);

  const filteredStaticTemplates = useMemo(() => {
    const q = templateSearch.toLowerCase();
    const base = q ? staticTemplates.filter(t => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) : staticTemplates.slice(0, 3);
    return base;
  }, [templateSearch]);

  const filteredStoredTemplates = useMemo(() => {
    const q = templateSearch.toLowerCase();
    if (!q) return storedTemplates;
    return storedTemplates.filter(t => t.name.toLowerCase().includes(q));
  }, [templateSearch, storedTemplates]);

  const stats = useMemo(() => ({
    total: companies.length,
    industries: industries.length,
    industryList: industries.join(' \u2022 '),
    new: companies.filter(c => c.status === 'new').length,
    inProgress: companies.filter(c => c.status === 'in_progress').length,
    compliant: companies.filter(c => c.status === 'compliant').length,
  }), [industries]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const deleteTemplate = async (id: number) => {
    const template = storedTemplates.find(t => t.id === id);
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        setStoredTemplates(prev => prev.filter(t => t.id !== id));
        setDeleteConfirm(null);
        toast({ title: "Template deleted", description: `"${template?.name}" has been removed` });
      } else {
        toast({ title: "Delete failed", description: "Could not delete template", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Delete failed", description: "Network error", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const goTo = (p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="h-10 w-10 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="font-sans min-h-screen bg-black" style={{ letterSpacing: '-0.011em', color: '#f5f5f7' }}>

      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'fadeIn 0.2s cubic-bezier(0.16,1,0.3,1)' }} data-testid="modal-delete-overlay">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={() => { if (!isDeleting) setDeleteConfirm(null); }} />
          <div className="relative bg-[#1c1c1e] rounded-3xl shadow-2xl w-full max-w-sm p-7 scale-in" style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5)' }}>
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5">
              <Trash2 className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="text-[17px] font-semibold text-white text-center mb-2 tracking-tight">Delete Template?</h3>
            <p className="text-[13px] text-[#8e8e93] text-center mb-7 leading-relaxed">This action cannot be undone. The template and all its entities will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} disabled={isDeleting} className="flex-1 py-2.5 bg-[#2c2c2e] text-[#d1d1d6] rounded-xl hover:bg-[#3a3a3c] smooth press-sm font-medium text-[13px]" data-testid="button-cancel-delete">Cancel</button>
              <button onClick={() => deleteConfirm !== null && deleteTemplate(deleteConfirm)} disabled={isDeleting} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 smooth press-sm font-semibold text-[13px] shadow-sm shadow-red-500/20" data-testid="button-confirm-delete">
                {isDeleting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Deleting...</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-10 bg-black" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => goTo('home')} className="press-sm" data-testid="logo-home">
              <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-[8px]" />
            </button>
            <div>
              <div className="text-[13px] font-semibold leading-tight tracking-tight text-white">Okiru</div>
              <div className="text-[10px] text-purple-400 font-medium -mt-px">Entity Studio</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c1c1e] text-[12px]" data-testid="user-menu">
              <span className="inline-flex h-5 w-5 rounded-full bg-purple-600 items-center justify-center text-white font-semibold text-[9px]">
                {(user?.fullName || user?.username || 'U').charAt(0).toUpperCase()}
              </span>
              <span className="text-[#d1d1d6] font-medium">{user?.fullName || user?.username || ''}</span>
            </div>
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-[#3a3a3c] text-[12px] smooth press-sm text-[#8e8e93] hover:text-[#d1d1d6]"
              data-testid="button-sign-out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {page === 'home' && (
          <section data-testid="page-home" className="fade-in">
            <div className="mb-10">
              <h1 className="text-[32px] font-bold tracking-[-0.03em] text-white">Dashboard</h1>
              <p className="text-[15px] text-[#98989f] mt-1">Choose what you want to do.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                className="group text-left rounded-2xl bg-[#1c1c1e] p-6 lift press hover:bg-[#2c2c2e] smooth"
                onClick={() => goTo('templates')}
                data-testid="card-create-entity"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[15px] font-semibold tracking-tight text-white">Entity Templates</div>
                    <div className="text-[13px] text-[#98989f] mt-1.5 leading-relaxed">Browse, edit, or create templates.</div>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-purple-500/10 grid place-items-center group-hover:bg-purple-500/15 smooth">
                    <Plus className="h-5 w-5 text-purple-400" />
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-1 text-[11px] text-[#636366] font-medium uppercase tracking-wider">
                  Templates <ChevronRight className="w-3 h-3" /> Create
                </div>
              </button>

              <button
                className="group text-left rounded-2xl bg-[#1c1c1e] p-6 lift press hover:bg-[#2c2c2e] smooth opacity-0 fade-in stagger-1"
                onClick={() => navigate('/processor')}
                data-testid="card-upload-docs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[15px] font-semibold tracking-tight text-white">Upload Documents</div>
                    <div className="text-[13px] text-[#98989f] mt-1.5 leading-relaxed">Process PDFs, images, and more.</div>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-purple-500/10 grid place-items-center group-hover:bg-purple-500/15 smooth">
                    <FileText className="h-5 w-5 text-purple-400" />
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-1 text-[11px] text-[#636366] font-medium uppercase tracking-wider">
                  Documents <ChevronRight className="w-3 h-3" /> Upload
                </div>
              </button>

              <button
                className="group text-left rounded-2xl bg-[#1c1c1e] p-6 lift press hover:bg-[#2c2c2e] smooth opacity-0 fade-in stagger-2"
                onClick={() => goTo('scorecards')}
                data-testid="card-scorecards"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[15px] font-semibold tracking-tight text-white">View Scorecards</div>
                    <div className="text-[13px] text-[#98989f] mt-1.5 leading-relaxed">Browse companies and compliance.</div>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-purple-500/10 grid place-items-center group-hover:bg-purple-500/15 smooth">
                    <Building2 className="h-5 w-5 text-purple-400" />
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-1 text-[11px] text-[#636366] font-medium uppercase tracking-wider">
                  Scorecards <ChevronRight className="w-3 h-3" /> Companies
                </div>
              </button>
            </div>
          </section>
        )}

        {page === 'templates' && (
          <section data-testid="page-templates" className="fade-in">
            <div className="flex items-start justify-between gap-4 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-[#3a3a3c] smooth press-sm text-[#8e8e93]"
                    onClick={() => goTo('home')}
                    data-testid="button-back-home"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <span className="text-[11px] text-[#636366] font-medium">/ Entity Templates</span>
                </div>
                <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white">Entity Templates</h1>
                <p className="text-[14px] text-[#98989f] mt-1">Start from a template, then customise fields & extraction rules.</p>
              </div>
              <Link href="/builder"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-500 text-[13px] font-semibold smooth press-sm shrink-0 shadow-sm shadow-purple-500/20"
                data-testid="button-build-entity"
              >
                <Sparkles className="h-4 w-4" />
                Build Entity
              </Link>
            </div>

            <div className="rounded-2xl bg-[#1c1c1e] p-4 mb-5">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#636366]" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  className="w-full rounded-xl bg-[#2c2c2e] pl-10 pr-4 py-2.5 text-[14px] text-white outline-none focus:ring-2 focus:ring-purple-500/30 smooth placeholder:text-[#48484a]"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  data-testid="input-template-search"
                />
              </div>
            </div>

            {loadingTemplates && storedTemplates.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-2xl bg-[#1c1c1e] p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-xl bg-white/[0.06] shimmer" />
                      <div className="flex-1">
                        <div className="h-4 bg-white/[0.06] rounded-lg w-2/3 mb-2 shimmer" />
                        <div className="h-3 bg-white/[0.06] rounded-lg w-1/3 shimmer" />
                      </div>
                    </div>
                    <div className="h-3 bg-white/[0.04] rounded-lg w-full mb-2 shimmer" />
                    <div className="h-3 bg-white/[0.04] rounded-lg w-4/5 shimmer" />
                  </div>
                ))}
              </div>
            )}

            {filteredStoredTemplates.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-[12px] font-semibold text-[#98989f] uppercase tracking-wider">Your Templates</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-semibold">{filteredStoredTemplates.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {filteredStoredTemplates.map((t, idx) => (
                    <div key={t.id} className={`rounded-2xl bg-[#1c1c1e] p-5 hover:bg-[#2c2c2e] smooth opacity-0 fade-in stagger-${Math.min(idx + 1, 6)}`} data-testid={`stored-template-${t.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-semibold tracking-tight text-white">{t.name}</div>
                          <div className="text-[11px] text-[#98989f] mt-1">{t.entities.length} entities &middot; v{t.version || '1.0'}</div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-semibold shrink-0">Custom</span>
                      </div>
                      <p className="text-[13px] text-[#98989f] mt-3 leading-relaxed">{t.description || 'Custom entity template'}</p>

                      <div className="mt-4">
                        <div className="flex flex-wrap gap-1.5">
                          {t.entities.slice(0, 4).map((e: any, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[#8e8e93] font-medium">{e.label}</span>
                          ))}
                          {t.entities.length > 4 && <span className="text-[10px] text-[#636366] font-medium self-center">+{t.entities.length - 4} more</span>}
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setDeleteConfirm(t.id)}
                            className="p-2 text-[#636366] hover:text-red-500 hover:bg-red-500/10 rounded-lg smooth press-sm"
                            title="Delete template"
                            data-testid={`button-delete-${t.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <Link href={`/builder?template=${t.id}`}
                            className="p-2 text-[#636366] hover:text-purple-400 hover:bg-purple-500/10 rounded-lg smooth press-sm"
                            title="Edit template"
                            data-testid={`button-edit-${t.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                        <Link href="/processor"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 text-[12px] font-semibold smooth press-sm shadow-sm shadow-purple-500/15"
                          data-testid={`button-use-${t.id}`}
                        >
                          Use Template
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <h2 className="text-[12px] font-semibold text-[#98989f] uppercase tracking-wider">Starter Templates</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="templates-grid">
              {filteredStaticTemplates.map((t, idx) => (
                <div key={t.key} className={`rounded-2xl bg-[#1c1c1e] p-5 hover:bg-[#2c2c2e] smooth opacity-0 fade-in stagger-${Math.min(idx + 1, 6)}`} data-testid={`template-${t.key}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-semibold tracking-tight text-white">{t.name}</div>
                      <div className={`text-[10px] font-semibold mt-1.5 px-2 py-0.5 rounded-full inline-block ${categoryColor[t.category] || 'bg-white/[0.06] text-[#8e8e93]'}`}>{t.category}</div>
                    </div>
                  </div>
                  <p className="text-[13px] text-[#98989f] mt-3 leading-relaxed">{t.description}</p>

                  <div className="mt-4">
                    <div className="text-[10px] font-semibold text-[#636366] uppercase tracking-wider">Entities</div>
                    <ul className="mt-2 space-y-1 text-[12px] text-[#98989f]">
                      {t.entities.slice(0, 4).map((e, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-purple-400 shrink-0" />
                          {e.label}
                        </li>
                      ))}
                      {t.entities.length > 4 && <li className="text-[#636366] font-medium">+ {t.entities.length - 4} more</li>}
                    </ul>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                    <Link href={`/builder?starter=${t.key}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[12px] font-medium smooth press-sm text-[#8e8e93]"
                      data-testid={`button-edit-${t.key}`}
                    >
                      Edit
                      <Pencil className="h-3 w-3 text-[#636366]" />
                    </Link>
                    <button
                      onClick={() => useTemplate(t)}
                      disabled={publishingKey === t.key}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 text-[12px] font-semibold smooth press-sm shadow-sm shadow-purple-500/15 disabled:opacity-60"
                      data-testid={`button-use-${t.key}`}
                    >
                      {publishingKey === t.key ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {publishingKey === t.key ? "Publishing…" : "Use Template"}
                      {publishingKey !== t.key && <ChevronRight className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
              {filteredStaticTemplates.length === 0 && filteredStoredTemplates.length === 0 && (
                <div className="rounded-2xl bg-[#1c1c1e] p-8 text-[14px] text-[#636366] col-span-full text-center fade-in">
                  No templates found. Try a different search.
                </div>
              )}
            </div>
          </section>
        )}

        {page === 'scorecards' && (
          <section data-testid="page-scorecards" className="fade-in">
            <div className="flex items-start justify-between gap-4 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-[#3a3a3c] smooth press-sm text-[#8e8e93]"
                    onClick={() => goTo('home')}
                    data-testid="button-back-home-sc"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <span className="text-[11px] text-[#636366] font-medium">/ Scorecards</span>
                </div>
                <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white">Company Scorecards</h1>
                <p className="text-[14px] text-[#98989f] mt-1">Search and filter companies by industry and status.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-2xl bg-[#1c1c1e] p-5 fade-in">
                <div className="text-[10px] text-[#98989f] font-semibold uppercase tracking-wider">Total companies</div>
                <div className="text-[32px] font-bold mt-1 tracking-[-0.03em] text-white" data-testid="stat-companies">{stats.total}</div>
              </div>
              <div className="rounded-2xl bg-[#1c1c1e] p-5 opacity-0 fade-in stagger-1">
                <div className="text-[10px] text-[#98989f] font-semibold uppercase tracking-wider">Industries</div>
                <div className="text-[32px] font-bold mt-1 tracking-[-0.03em] text-white" data-testid="stat-industries">{stats.industries}</div>
                <div className="text-[10px] text-[#636366] mt-2">{stats.industryList}</div>
              </div>
              <div className="rounded-2xl bg-[#1c1c1e] p-5 opacity-0 fade-in stagger-2">
                <div className="text-[10px] text-[#98989f] font-semibold uppercase tracking-wider">Statuses</div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2.5 py-1 rounded-full bg-white/[0.06] text-[#8e8e93] font-medium">New: {stats.new}</span>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">In Progress: {stats.inProgress}</span>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">Compliant: {stats.compliant}</span>
                </div>
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
                      className="w-full rounded-xl bg-[#2c2c2e] pl-10 pr-4 py-2.5 text-[14px] text-white outline-none focus:ring-2 focus:ring-purple-500/30 smooth placeholder:text-[#48484a]"
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      data-testid="input-company-search"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-[#98989f] uppercase tracking-wider" htmlFor="industryFilter">Industry</label>
                    <select
                      id="industryFilter"
                      className="mt-1.5 block rounded-xl bg-[#2c2c2e] px-3 py-2.5 text-[13px] text-[#d1d1d6] outline-none focus:ring-2 focus:ring-purple-500/30 smooth"
                      value={industryFilter}
                      onChange={(e) => setIndustryFilter(e.target.value)}
                      data-testid="select-industry"
                    >
                      <option value="all">All</option>
                      {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-[#98989f] uppercase tracking-wider" htmlFor="statusFilter">Status</label>
                    <select
                      id="statusFilter"
                      className="mt-1.5 block rounded-xl bg-[#2c2c2e] px-3 py-2.5 text-[13px] text-[#d1d1d6] outline-none focus:ring-2 focus:ring-purple-500/30 smooth"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      data-testid="select-status"
                    >
                      <option value="all">All</option>
                      <option value="new">New</option>
                      <option value="in_progress">In Progress</option>
                      <option value="compliant">Compliant</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#1c1c1e] overflow-hidden">
              <div className="px-5 py-3.5 flex items-center justify-between">
                <div className="text-[13px] font-semibold text-white">Companies</div>
                <div className="text-[11px] text-[#98989f] font-medium" data-testid="results-count">{filteredCompanies.length} result{filteredCompanies.length !== 1 ? 's' : ''}</div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-[13px]">
                  <thead className="bg-white/[0.03]">
                    <tr className="text-left text-[10px] text-[#98989f] uppercase tracking-wider">
                      <th className="px-5 py-2.5 font-semibold">Company</th>
                      <th className="px-5 py-2.5 font-semibold">Company ID</th>
                      <th className="px-5 py-2.5 font-semibold">Industry</th>
                      <th className="px-5 py-2.5 font-semibold">Status</th>
                      <th className="px-5 py-2.5 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredCompanies.map(c => (
                      <tr key={c.id} className="hover:bg-white/[0.03] smooth" data-testid={`company-row-${c.id}`}>
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-white">{c.name}</div>
                          <div className="text-[10px] text-[#636366] mt-0.5">Scorecard ready</div>
                        </td>
                        <td className="px-5 py-3.5 text-[#98989f] font-mono text-[11px]">{c.id}</td>
                        <td className="px-5 py-3.5 text-[#8e8e93]">{c.industry}</td>
                        <td className="px-5 py-3.5">
                          <span className={statusPillClass(c.status)}>{statusLabel(c.status)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[12px] font-medium smooth press-sm text-[#8e8e93]"
                            onClick={() => navigate(`/toolkit/${c.id}`)}
                            data-testid={`button-view-${c.id}`}
                          >
                            View
                            <ChevronRight className="h-3 w-3 text-[#636366]" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredCompanies.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-[14px] text-[#636366]">
                          No companies match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
