import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@toolkit/lib/auth';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import { Trash2, Loader2, LogOut, Pencil, ChevronLeft, Search, ChevronRight, Plus, FileText, Building2, Sparkles, HelpCircle, Play, UploadCloud, ExternalLink } from 'lucide-react';
import { useOnboarding, OnboardingWelcome, OnboardingTour } from '@/components/OnboardingTour';

interface ProcessorSession {
  id: string;
  companyInfo: {
    name: string; sector: string; registrationNumber: string;
    annualTurnover?: string; employees?: string; contactName?: string;
    contactEmail?: string; currentBBEELevel?: string;
  };
  createdAt: string;
  updatedAt: string;
  currentStep: string;
  filesData: { id: number; name: string; size: string; type: string }[];
  extractionResults: { fileName?: string; templateName?: string }[];
  isComplete: boolean;
}

interface CompanyRow {
  name: string;
  id: string;
  industry: string;
  status: 'in_progress' | 'complete';
  sessionId: string;
  subtitle?: string;
  isComplete: boolean;
}

interface StoredTemplate {
  id: number;
  name: string;
  description: string;
  version: string;
  entities: { label: string; definition: string; synonyms?: string[]; zones?: string[]; keywords?: any; pattern?: string; positives?: string[]; negatives?: string[] }[];
  createdAt: string;
  updatedAt: string;
}


type Page = 'home' | 'templates' | 'scorecards';

function statusLabel(status: string) {
  if (status === "complete") return "Complete";
  if (status === "in_progress") return "In Progress";
  return status;
}

function statusPillClass(status: string) {
  const base = "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium";
  if (status === "complete") return `${base} bg-emerald-500/15 text-emerald-400`;
  if (status === "in_progress") return `${base} bg-amber-500/15 text-amber-400`;
  return `${base} bg-white/[0.06] text-[#8e8e93]`;
}

export default function Dashboard() {
  const search = useSearch();
  const initialTab = new URLSearchParams(search).get('tab') as Page | null;
  const [page, setPage] = useState<Page>(initialTab && ['home', 'templates', 'scorecards'].includes(initialTab) ? initialTab : 'home');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [templateSearch, setTemplateSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [industryFilter, setIndustryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [storedTemplates, setStoredTemplates] = useState<StoredTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const { needsOnboarding, showTour, startTour, completeTour, dismissTour } = useOnboarding(user?.id);
  const [processorSessions, setProcessorSessions] = useState<ProcessorSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [deleteSessionConfirm, setDeleteSessionConfirm] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [rowOrder, setRowOrder] = useState<string[]>([]);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    setRowOrder(prev => {
      const ids = processorSessions.map(s => s.id);
      const existing = prev.filter(id => ids.includes(id));
      const newIds = ids.filter(id => !prev.includes(id));
      return [...existing, ...newIds];
    });
  }, [processorSessions]);

  const moveRow = (sessionId: string, direction: 'up' | 'down') => {
    setRowOrder(prev => {
      const idx = prev.indexOf(sessionId);
      if (idx === -1) return prev;
      const next = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    setIsDeletingSession(true);
    try {
      const res = await fetch(`/api/processor-sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setProcessorSessions(prev => prev.filter(s => s.id !== sessionId));
        toast({ title: 'Assessment deleted', description: 'The client assessment has been removed.' });
      } else {
        toast({ title: 'Delete failed', description: 'Could not delete the assessment.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Delete failed', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setIsDeletingSession(false);
      setDeleteSessionConfirm(null);
    }
  }, [toast]);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/processor-sessions');
      if (res.ok) {
        const data = await res.json();
        setProcessorSessions(data);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (page === 'scorecards') {
      fetchSessions();
    }
  }, [page, fetchSessions]);

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

  const allCompanies = useMemo<CompanyRow[]>(() => {
    return processorSessions.map(s => ({
      name: s.companyInfo.name,
      id: s.id,
      industry: s.companyInfo.sector || 'Other',
      status: s.isComplete ? 'complete' : 'in_progress',
      sessionId: s.id,
      isComplete: s.isComplete,
      subtitle: s.isComplete
        ? `${s.extractionResults?.length || 0} doc${(s.extractionResults?.length || 0) !== 1 ? 's' : ''} processed · Assessment complete`
        : s.currentStep === 'review'
        ? 'Extraction complete — awaiting review'
        : `In progress · ${s.filesData?.length || 0} doc${(s.filesData?.length || 0) !== 1 ? 's' : ''} uploaded`,
    }));
  }, [processorSessions]);

  const industries = useMemo(() => Array.from(new Set(allCompanies.map(c => c.industry))).sort(), [allCompanies]);

  const filteredCompanies = useMemo(() => {
    let result = allCompanies.slice();
    const q = companySearch.toLowerCase();
    if (q) result = result.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    if (industryFilter !== 'all') result = result.filter(c => c.industry === industryFilter);
    if (statusFilter !== 'all') result = result.filter(c => c.status === statusFilter);
    if (rowOrder.length > 0) {
      result.sort((a, b) => {
        const ai = rowOrder.indexOf(a.sessionId);
        const bi = rowOrder.indexOf(b.sessionId);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
    return result;
  }, [allCompanies, companySearch, industryFilter, statusFilter, rowOrder]);

  const filteredStoredTemplates = useMemo(() => {
    const q = templateSearch.toLowerCase();
    if (!q) return storedTemplates;
    return storedTemplates.filter(t => t.name.toLowerCase().includes(q));
  }, [templateSearch, storedTemplates]);

  const stats = useMemo(() => ({
    total: allCompanies.length,
    industries: industries.length,
    industryList: industries.join(' \u2022 '),
    inProgress: allCompanies.filter(c => c.status === 'in_progress').length,
    complete: allCompanies.filter(c => c.status === 'complete').length,
  }), [allCompanies, industries]);

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

  return (
    <div className="font-sans min-h-screen bg-black" style={{ letterSpacing: '-0.011em', color: '#f5f5f7' }}>

      {showTour && page === 'home' && <OnboardingTour onComplete={completeTour} onDismiss={dismissTour} />}

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

      <header className="h-14 shrink-0 z-20 sticky top-0 bg-black" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="max-w-[1400px] mx-auto w-full px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/hub" className="flex items-center gap-2 text-[#98989f] hover:text-white smooth group shrink-0">
              <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 smooth" />
              <span className="text-[13px] font-medium tracking-wide">Back to Hub</span>
            </Link>
            <div className="w-px h-5 bg-[#2c2c2e] hidden sm:block"></div>
            <button onClick={() => goTo('home')} className="flex items-center gap-3 press-sm" data-testid="logo-home">
              <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-[8px]" />
              <span className="text-lg font-semibold tracking-tight text-white border-l border-[#2c2c2e] pl-3">Dashboard</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPage('home'); startTour(); }}
              className="p-2 rounded-full bg-[#1c1c1e] hover:bg-[#3a3a3c] smooth press-sm text-[#8e8e93] hover:text-[#d1d1d6]"
              title="Take a tour"
              aria-label="Take a guided tour"
              data-testid="button-help-tour"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c1c1e] text-[12px]" data-testid="user-menu">
              <span className="inline-flex h-5 w-5 rounded-full bg-white/[0.12] items-center justify-center text-white font-semibold text-[9px]">
                {(user?.fullName || user?.username || 'U').charAt(0).toUpperCase()}
              </span>
              <span className="text-[#d1d1d6] font-medium">{user?.fullName || user?.username || ''}</span>
            </div>
            <button
              onClick={async () => { await logout(); navigate('/auth'); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-[#3a3a3c] text-[12px] smooth press-sm text-[#8e8e93] hover:text-[#d1d1d6]"
              data-testid="button-sign-out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">

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
                  <div className="h-10 w-10 rounded-xl bg-white/[0.06] grid place-items-center group-hover:bg-white/[0.18]/15 smooth">
                    <Plus className="h-5 w-5 text-[#d1d1d6]" />
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
                  <div className="h-10 w-10 rounded-xl bg-white/[0.06] grid place-items-center group-hover:bg-white/[0.18]/15 smooth">
                    <FileText className="h-5 w-5 text-[#d1d1d6]" />
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
                  <div className="h-10 w-10 rounded-xl bg-white/[0.06] grid place-items-center group-hover:bg-white/[0.18]/15 smooth">
                    <Building2 className="h-5 w-5 text-[#d1d1d6]" />
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
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.12] text-white hover:bg-white/[0.18] text-[13px] font-semibold smooth press-sm shrink-0 shadow-sm shadow-black/10"
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
                  className="w-full rounded-xl bg-[#2c2c2e] pl-10 pr-4 py-2.5 text-[14px] text-white outline-none focus:ring-2 focus:ring-white/[0.15] smooth placeholder:text-[#48484a]"
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
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.08] text-[#d1d1d6] font-semibold">{filteredStoredTemplates.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {filteredStoredTemplates.map((t, idx) => (
                    <div key={t.id} className={`rounded-2xl bg-[#1c1c1e] p-5 hover:bg-[#2c2c2e] smooth opacity-0 fade-in stagger-${Math.min(idx + 1, 6)}`} data-testid={`stored-template-${t.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-semibold tracking-tight text-white">{t.name}</div>
                          <div className="text-[11px] text-[#98989f] mt-1">{t.entities.length} entities &middot; v{t.version || '1.0'}</div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.08] text-[#d1d1d6] font-semibold shrink-0">Custom</span>
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
                          <button
                            onClick={() => { setEditingTemplateId(t.id); navigate(`/builder?template=${t.id}`); }}
                            className="p-2 text-[#636366] hover:text-[#d1d1d6] hover:bg-white/[0.18]/10 rounded-lg smooth press-sm"
                            title="Edit template"
                            data-testid={`button-edit-${t.id}`}
                          >
                            {editingTemplateId === t.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#d1d1d6]" />
                              : <Pencil className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <Link href="/processor"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/[0.12] text-white hover:bg-white/[0.18] text-[12px] font-semibold smooth press-sm shadow-sm shadow-black/8"
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

            {filteredStoredTemplates.length === 0 && (
              <div className="rounded-2xl bg-[#1c1c1e] p-8 text-[14px] text-[#636366] text-center fade-in" data-testid="templates-empty">
                No templates found. Try a different search.
              </div>
            )}
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
              <Link
                href="/processor"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.12] hover:bg-white/[0.18] text-white text-[13px] font-semibold smooth press-sm shadow-sm shadow-black/10 shrink-0 mt-8"
                data-testid="button-new-assessment"
              >
                <UploadCloud className="h-4 w-4" />
                New Assessment
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-2xl bg-[#1c1c1e] p-5 fade-in">
                <div className="text-[10px] text-[#98989f] font-semibold uppercase tracking-wider">Total Clients</div>
                <div className="text-[32px] font-bold mt-1 tracking-[-0.03em] text-white" data-testid="stat-companies">
                  {loadingSessions ? <Loader2 className="w-6 h-6 animate-spin text-[#636366] inline-block" /> : stats.total}
                </div>
              </div>
              <div className="rounded-2xl bg-[#1c1c1e] p-5 opacity-0 fade-in stagger-1">
                <div className="text-[10px] text-[#98989f] font-semibold uppercase tracking-wider">Industries</div>
                <div className="text-[32px] font-bold mt-1 tracking-[-0.03em] text-white" data-testid="stat-industries">
                  {loadingSessions ? '—' : stats.industries}
                </div>
                <div className="text-[10px] text-[#636366] mt-2">{stats.industryList || 'No sessions yet'}</div>
              </div>
              <div className="rounded-2xl bg-[#1c1c1e] p-5 opacity-0 fade-in stagger-2">
                <div className="text-[10px] text-[#98989f] font-semibold uppercase tracking-wider">Statuses</div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">In Progress: {stats.inProgress}</span>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">Complete: {stats.complete}</span>
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
                      className="w-full rounded-xl bg-[#2c2c2e] pl-10 pr-4 py-2.5 text-[14px] text-white outline-none focus:ring-2 focus:ring-white/[0.15] smooth placeholder:text-[#48484a]"
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
                      className="mt-1.5 block rounded-xl bg-[#2c2c2e] px-3 py-2.5 text-[13px] text-[#d1d1d6] outline-none focus:ring-2 focus:ring-white/[0.15] smooth"
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
                      className="mt-1.5 block rounded-xl bg-[#2c2c2e] px-3 py-2.5 text-[13px] text-[#d1d1d6] outline-none focus:ring-2 focus:ring-white/[0.15] smooth"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      data-testid="select-status"
                    >
                      <option value="all">All</option>
                      <option value="in_progress">In Progress</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#1c1c1e] overflow-hidden">
              <div className="px-5 py-3.5 flex items-center justify-between">
                <div className="text-[13px] font-semibold text-white">Client Assessments</div>
                <div className="text-[11px] text-[#98989f] font-medium" data-testid="results-count">
                  {loadingSessions ? <Loader2 className="w-3 h-3 animate-spin inline-block" /> : `${filteredCompanies.length} result${filteredCompanies.length !== 1 ? 's' : ''}`}
                </div>
              </div>

              {loadingSessions ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-6 h-6 text-[#d1d1d6] animate-spin" />
                  <p className="text-[#8e8e93] text-sm">Loading assessments...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[13px]">
                    <thead className="bg-white/[0.03]">
                      <tr className="text-left text-[10px] text-[#98989f] uppercase tracking-wider">
                        <th className="px-5 py-2.5 font-semibold">Company</th>
                        <th className="px-5 py-2.5 font-semibold">Session ID</th>
                        <th className="px-5 py-2.5 font-semibold">Industry</th>
                        <th className="px-5 py-2.5 font-semibold">Status</th>
                        <th className="px-5 py-2.5 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {filteredCompanies.map((c, idx) => {
                        const isHovered = hoveredRow === c.sessionId;
                        const isFirst = idx === 0;
                        const isLast = idx === filteredCompanies.length - 1;
                        return (
                        <tr key={c.id}
                          className="hover:bg-white/[0.03] smooth group"
                          data-testid={`company-row-${c.id}`}
                          onMouseEnter={() => setHoveredRow(c.sessionId)}
                          onMouseLeave={() => { if (deleteSessionConfirm !== c.sessionId) setHoveredRow(null); }}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-white">{c.name}</div>
                              {!c.isComplete && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold tracking-wider uppercase">Active</span>
                              )}
                              {c.isComplete && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold tracking-wider uppercase">Done</span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#636366] mt-0.5">{c.subtitle}</div>
                          </td>
                          <td className="px-5 py-3.5 text-[#98989f] font-mono text-[11px]">{c.sessionId.slice(0, 18)}…</td>
                          <td className="px-5 py-3.5 text-[#8e8e93]">{c.industry}</td>
                          <td className="px-5 py-3.5">
                            <span className={statusPillClass(c.status)}>{statusLabel(c.status)}</span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {deleteSessionConfirm === c.sessionId ? (
                                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-1.5">
                                  <span className="text-[11px] text-red-400 font-medium">Delete?</span>
                                  <button
                                    onClick={() => handleDeleteSession(c.sessionId)}
                                    disabled={isDeletingSession}
                                    className="px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-400 text-white text-[11px] font-semibold smooth press-sm disabled:opacity-60"
                                    data-testid={`button-confirm-delete-${c.id}`}
                                  >
                                    {isDeletingSession ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes, delete'}
                                  </button>
                                  <button
                                    onClick={() => { setDeleteSessionConfirm(null); setHoveredRow(null); }}
                                    disabled={isDeletingSession}
                                    className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[#8e8e93] text-[11px] font-medium smooth press-sm"
                                    data-testid={`button-cancel-delete-${c.id}`}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className={`flex items-center gap-0.5 transition-opacity duration-150 ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                    <button
                                      onClick={() => moveRow(c.sessionId, 'up')}
                                      disabled={isFirst}
                                      className="p-1 rounded text-[#636366] hover:text-white hover:bg-white/[0.08] smooth press-sm disabled:opacity-20 disabled:cursor-not-allowed"
                                      title="Move up"
                                      data-testid={`button-move-up-${c.id}`}
                                    >
                                      <ChevronRight className="h-3.5 w-3.5 -rotate-90" />
                                    </button>
                                    <button
                                      onClick={() => moveRow(c.sessionId, 'down')}
                                      disabled={isLast}
                                      className="p-1 rounded text-[#636366] hover:text-white hover:bg-white/[0.08] smooth press-sm disabled:opacity-20 disabled:cursor-not-allowed"
                                      title="Move down"
                                      data-testid={`button-move-down-${c.id}`}
                                    >
                                      <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteSessionConfirm(c.sessionId)}
                                      className="p-1.5 rounded-lg text-[#636366] hover:text-red-400 hover:bg-red-500/10 smooth press-sm ml-0.5"
                                      data-testid={`button-delete-${c.id}`}
                                      title="Delete assessment"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  {c.isComplete ? (
                                    <Link
                                      href={`/toolkit/${c.sessionId}`}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-semibold smooth press-sm"
                                      data-testid={`button-toolkit-${c.id}`}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      View in Toolkit
                                    </Link>
                                  ) : (
                                    <Link
                                      href={`/processor?session=${c.sessionId}`}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.12] hover:bg-white/[0.18] text-white text-[12px] font-semibold smooth press-sm"
                                      data-testid={`button-resume-${c.id}`}
                                    >
                                      <Play className="h-2.5 w-2.5" />
                                      Resume
                                    </Link>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                      {filteredCompanies.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-5 py-16 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <Building2 className="w-8 h-8 text-[#3a3a3c]" />
                              <p className="text-[14px] text-[#636366]">No assessments yet</p>
                              <Link href="/processor" className="text-[13px] text-[#d1d1d6] hover:text-[#e5e5e7] font-medium smooth">
                                Start a new assessment →
                              </Link>
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
        )}
      </main>
    </div>
  );
}
