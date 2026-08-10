import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@toolkit/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { checkOnboardingGate } from '@/lib/onboardingStatus';
import { gatedAuthPath } from '@/lib/authRoutes';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import hubBackground from '@assets/image_1779723521128.png';
import certCardBg from '@assets/image_1779724907320.png';
import {
  ChevronRight, Search, X, ArrowUpRight, Building2,
  Award, Leaf, Users, BookOpen, Briefcase, ShieldCheck,
  Sparkles, Plus, LineChart, UserCog, ChevronDown,
  Files,
} from 'lucide-react';
import { UserAccountMenu, companyProfilePath } from '@/components/UserAccountMenu';
import { useEsgAccess } from '@/hooks/useEsgAccess';
import { Crown } from 'lucide-react';
import { isSkippedCompanyProfileName } from '@/lib/profilePlaceholder';

interface CompanyProfile {
  companyName?: string;
  beeLevel?: string | null;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function firstName(full?: string | null, username?: string | null): string {
  if (full && full.trim()) return full.trim().split(/\s+/)[0];
  return username || 'there';
}

export default function HubLanding() {
  const { user, isLoading: authLoading } = useAuth();
  const { allowed: esgAllowed } = useEsgAccess();
  const { toast } = useToast();
  const [location, navigate] = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Cmd/Ctrl+K opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((s) => !s);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Load company profile (for personalized welcome) and force onboarding if incomplete.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        const gate = await checkOnboardingGate();
        if (cancelled) return;
        if (gate.status === "needs-onboarding") {
          const safe =
            location.startsWith('/') && !location.startsWith('//') && location !== '/onboarding' && location !== '/auth'
              ? location
              : '/hub';
          navigate(gatedAuthPath({ redirect: safe }), { replace: true });
          return;
        }
        const p = gate.profile;
        setProfile({
          companyName: typeof p?.companyName === "string" ? p.companyName : undefined,
          beeLevel:
            p?.beeLevel === null || p?.beeLevel === undefined
              ? null
              : String(p.beeLevel),
        });
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, location, navigate]);

  const handleComingSoon = () => {
    toast({ title: 'Coming Soon', description: 'This toolkit is currently in development.' });
  };

  const toolkits = useMemo(() => {
    const items = [
    {
      id: 'bbbee-cert',
      title: 'B-BBEE Certificate Hub',
      description:
        'A single source of truth for managing, verifying and tracking compliance certificates across your supplier ecosystem.',
      tag: 'B-BBEE',
      aiBadge: 'AI-Verified',
      icon: <Award className="w-5 h-5" />,
      link: '/certificates',
      features: ['AI certificate extraction', 'Expiry alerts & renewals', 'Procurement spend analytics'],
      featured: true,
      backgroundImage: certCardBg,
    },
    ...(esgAllowed
      ? [{
      id: 'esg',
      title: 'ESG Intelligence Toolkit',
      tag: 'ESG',
      aiBadge: 'AI-Insights',
      icon: <Leaf className="w-4 h-4" />,
      link: '/esg/clients',
      description: 'Carbon, social and governance scoring aligned to King V, IFRS S1/S2 and GRI.',
      features: ['GHG inventory & carbon tax', 'E/S/G scorecards', 'Net-zero roadmap'],
    }]
      : []),
    {
      id: 'employment-equity', title: 'Employment Equity', tag: 'HR & PEOPLE', aiBadge: 'AI-Analytics',
      icon: <Users className="w-4 h-4" />, action: handleComingSoon,
      description: 'EEA2/EEA4 reports, demographic profiling and 5-year equity plans.',
    },
    {
      id: 'wsp-atr', title: 'WSP/ATR Reporting', tag: 'HR & PEOPLE', aiBadge: 'AI-Assisted',
      icon: <BookOpen className="w-4 h-4" />, action: handleComingSoon,
      description: 'Annual SETA submissions with automated training-needs analysis.',
    },
    {
      id: 'financial-audit', title: 'Financial Audit', tag: 'FINANCE', aiBadge: 'AI-Reviewed',
      icon: <Briefcase className="w-4 h-4" />, action: handleComingSoon,
      description: 'Audit evidence repository, finding tracker and risk-based planning.',
    },
  ];
    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esgAllowed]);

  const active = toolkits.filter((t) => 'link' in t && t.link);

  const filteredActive = searchQuery.trim()
    ? active.filter((t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tag.toLowerCase().includes(searchQuery.toLowerCase()))
    : active;

  const featured = filteredActive.find((t: any) => t.featured) || filteredActive[0];
  const otherActive = filteredActive.filter((t) => t.id !== featured?.id);

  const displayName = firstName(user?.fullName, user?.username);
  const companyName = profile?.companyName || user?.organizationName || null;
  const companyNameFriendly =
    companyName && isSkippedCompanyProfileName(companyName)
      ? "Your company (add details anytime)"
      : companyName;

  return (
    <div
      className="font-sans min-h-screen bg-black relative overflow-x-hidden"
      style={{ letterSpacing: '-0.011em', color: '#f5f5f7' }}
    >
      {/* Cinematic smoke background — fixed so it stays put as you scroll */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-no-repeat bg-cover bg-center"
        style={{ backgroundImage: `url(${hubBackground})`, opacity: 0.55 }}
      />
      {/* Vignette to keep text readable over the image */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.92) 100%)',
        }}
      />
      {/* Subtle violet brand wash — same as before, just a quiet signal */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 w-[760px] h-[760px] rounded-full opacity-[0.10] blur-[140px] float-soft z-0"
        style={{
          background: 'radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(168,85,247,0) 70%)',
          transform: 'translate(-50%, 0)',
        }}
      />

      <header
        className="h-14 shrink-0 z-20 sticky top-0 backdrop-blur-xl bg-black/70"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-[8px]" />
            <span className="text-[15px] font-semibold tracking-tight text-white border-l border-white/[0.07] pl-3">
              Okiru Hub
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Consolidated Team menu — Workspace + Admin + Super Admin */}
            <div className="relative">
              <button
                onClick={() => setTeamMenuOpen((s) => !s)}
                className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-violet-500/15 border border-violet-400/35 hover:bg-violet-500/25 hover:border-violet-300/45 smooth press-sm text-violet-100 shadow-sm shadow-violet-950/20"
                title="Team & access"
                aria-haspopup="menu"
                aria-expanded={teamMenuOpen}
                data-testid="btn-team-menu"
              >
                <Users className="h-3.5 w-3.5" />
                <span className="text-[12px] font-semibold">Team</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${teamMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {teamMenuOpen && (
                <>
                  <div
                    aria-hidden
                    className="fixed inset-0 z-30"
                    onClick={() => setTeamMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-[260px] rounded-2xl border border-white/[0.08] bg-[#141416]/95 backdrop-blur-xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.7)] overflow-hidden z-40"
                  >
                    <div className="px-3 pt-3 pb-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[#636366] font-semibold">
                        Team & access
                      </div>
                    </div>
                    <button
                      role="menuitem"
                      onClick={() => { setTeamMenuOpen(false); navigate('/workspace'); }}
                      className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/[0.05] smooth text-left"
                      data-testid="menu-item-workspace"
                    >
                      <div className="h-8 w-8 rounded-lg bg-violet-500/15 border border-violet-400/25 grid place-items-center shrink-0">
                        <Building2 className="h-4 w-4 text-violet-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-white">Workspace</div>
                        <div className="text-[11px] text-[#8e8e93]">Invite people, manage your team</div>
                      </div>
                    </button>
                    {user?.role === 'admin' && (
                      <Link
                        href="/admin/users"
                        onClick={() => setTeamMenuOpen(false)}
                        className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/[0.05] smooth text-left"
                        data-testid="menu-item-admin-users"
                      >
                        <div className="h-8 w-8 rounded-lg bg-white/[0.06] border border-white/[0.08] grid place-items-center shrink-0">
                          <UserCog className="h-4 w-4 text-[#d1d1d6]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-white">User management</div>
                          <div className="text-[11px] text-[#8e8e93]">Roles, permissions, accounts</div>
                        </div>
                      </Link>
                    )}
                    {(user?.role === 'admin' || user?.role === 'super_admin') && (
                      <Link
                        href="/admin/analytics"
                        onClick={() => setTeamMenuOpen(false)}
                        className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/[0.05] smooth text-left"
                        data-testid="menu-item-admin-analytics"
                      >
                        <div className="h-8 w-8 rounded-lg bg-white/[0.06] border border-white/[0.08] grid place-items-center shrink-0">
                          <LineChart className="h-4 w-4 text-[#d1d1d6]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-white">Traffic analytics</div>
                          <div className="text-[11px] text-[#8e8e93]">Visitors, sources, search performance</div>
                        </div>
                      </Link>
                    )}
                    {user?.role === 'super_admin' && (
                      <Link
                        href="/super-admin"
                        onClick={() => setTeamMenuOpen(false)}
                        className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/[0.05] smooth text-left border-t border-white/[0.05]"
                        data-testid="menu-item-super-admin"
                      >
                        <div className="h-8 w-8 rounded-lg bg-amber-500/15 border border-amber-500/30 grid place-items-center shrink-0">
                          <Crown className="h-4 w-4 text-amber-300" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
                            Super Admin
                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold">
                              Owner
                            </span>
                          </div>
                          <div className="text-[11px] text-[#8e8e93]">Platform-wide controls</div>
                        </div>
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Inline-expanding search */}
            <div
              className={`relative flex items-center rounded-full border smooth overflow-hidden ${
                searchOpen
                  ? 'w-[220px] sm:w-[300px] bg-white/[0.06] border-white/[0.14]'
                  : 'w-9 bg-white/[0.04] hover:bg-white/[0.08] border-transparent'
              }`}
              style={{ transitionProperty: 'width, background-color, border-color' }}
            >
              <button
                onClick={() => {
                  if (searchOpen && !searchQuery) setSearchOpen(false);
                  else setSearchOpen(true);
                }}
                className="shrink-0 h-9 w-9 grid place-items-center text-[#8e8e93] hover:text-white smooth press-sm"
                title="Search toolkits"
                aria-label="Search toolkits"
                data-testid="btn-search-toolkits"
              >
                <Search className="h-4 w-4" />
              </button>
              <input
                type="text"
                placeholder="Search toolkits…"
                autoFocus={searchOpen}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false); }
                }}
                onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                tabIndex={searchOpen ? 0 : -1}
                aria-hidden={!searchOpen}
                className={`flex-1 min-w-0 bg-transparent pr-2 text-[13px] text-white placeholder-[#636366] outline-none ${
                  searchOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                } transition-opacity duration-150`}
                data-testid="input-search-toolkits"
              />
              {searchOpen && searchQuery && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                  className="shrink-0 h-7 w-7 mr-1 grid place-items-center rounded-full text-[#636366] hover:text-white hover:bg-white/[0.08] smooth"
                  title="Clear search"
                  data-testid="btn-clear-search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {user?.id && !authLoading ? <UserAccountMenu variant="hub" /> : null}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1280px] mx-auto px-4 sm:px-6 pt-12 pb-20">
        {/* HERO - personalized */}
        <section className="mb-12 fade-in" data-testid="hero-welcome">
          <div className="flex items-center gap-2 mb-5 text-[11px] font-medium tracking-[0.18em] uppercase text-[#8e8e93]">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400/80 pulse-soft" />
            Okiru Hub
          </div>
          <h1
            className="text-[40px] leading-[1.04] sm:text-[60px] font-semibold tracking-tight text-white"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
          >
            {greeting()},{' '}
            {authLoading ? (
              <span className="skel inline-block h-[40px] w-44 align-middle rounded-md" />
            ) : (
              <button
                type="button"
                onClick={() => navigate(companyProfilePath('/hub'))}
                className="text-white border-b border-dashed border-white/30 hover:border-violet-300/80 hover:text-violet-100 transition-colors pb-0.5"
                data-testid="text-greeting-name"
              >
                {displayName}
              </button>
            )}
            <span className="text-[#5a5a60]">.</span>
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {profileLoading ? (
              <span className="skel h-7 w-64 rounded-full" />
            ) : companyName ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[12px] text-[#d1d1d6]">
                  <Building2 className="w-3 h-3 text-[#8e8e93]" />
                  {companyNameFriendly}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/workspace')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-400/25 text-[12px] text-violet-200 hover:bg-violet-500/20 hover:border-violet-300/40 transition-colors"
                  data-testid="link-hero-workspace-signed-in"
                >
                  <Users className="w-3 h-3" />
                  Invite your team
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/workspace')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-400/25 text-[12px] text-violet-200 hover:bg-violet-500/20 hover:border-violet-300/40 transition-colors"
                data-testid="link-hero-workspace-anon"
              >
                <Building2 className="w-3 h-3" />
                Set up your workspace
              </button>
            )}
          </div>
        </section>

        {/* PRIMARY ACTIONS — Create / View scorecard / ESG */}
        <section className="mb-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="hero-primary-actions">
          <Link
            href="/create-scorecard"
            className="card-rise group relative block rounded-2xl p-6 sm:p-7 min-h-[200px] overflow-hidden border border-violet-400/25 hover:border-violet-300/50 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_60px_-20px_rgba(139,92,246,0.45)] cursor-pointer"
            style={{
              backgroundImage:
                'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(139,92,246,0.08) 40%, rgba(255,255,255,0.02) 100%)',
            }}
            data-testid="action-create-scorecard"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 -right-16 w-56 h-56 rounded-full opacity-60 blur-3xl"
              style={{
                background:
                  'radial-gradient(circle, rgba(168,85,247,0.35) 0%, rgba(168,85,247,0) 70%)',
              }}
            />
            <div className="relative flex flex-col h-full">
              <div className="flex items-center justify-between mb-5">
                <div className="w-11 h-11 rounded-xl bg-violet-500/25 border border-violet-300/40 text-white flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                  <Plus className="w-5 h-5" strokeWidth={2.4} />
                </div>
                <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-violet-200/80">
                  Primary
                </span>
              </div>
              <h3
                className="text-[24px] sm:text-[26px] font-semibold tracking-tight text-white leading-[1.1]"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
              >
                Create Scorecard
              </h3>
              <p className="mt-2 text-[13.5px] text-[#d1d1d6]/90 leading-relaxed max-w-md">
                Start a new B-BBEE scorecard — enter your company information and complete the assessment workbook.
              </p>
              <span className="mt-auto pt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-white">
                New workbook
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </div>
          </Link>

          <Link
            href="/dashboard"
            className="card-rise group relative block rounded-2xl p-6 sm:p-7 min-h-[200px] bg-white/[0.03] backdrop-blur-md border border-white/[0.08] hover:border-white/[0.20] hover:bg-white/[0.05] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] cursor-pointer"
            data-testid="action-view-scorecard"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-5">
                <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/[0.14] text-white flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <LineChart className="w-5 h-5" strokeWidth={2.2} />
                </div>
                <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#8e8e93]">
                  Library
                </span>
              </div>
              <h3
                className="text-[24px] sm:text-[26px] font-semibold tracking-tight text-white leading-[1.1]"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
              >
                View Scorecard
              </h3>
              <p className="mt-2 text-[13.5px] text-[#a1a1a6] leading-relaxed max-w-md">
                Open saved companies, review scorecard summaries, and continue editing existing workbooks.
              </p>
              <span className="mt-auto pt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#d1d1d6] group-hover:text-white transition-colors">
                Saved companies
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </div>
          </Link>

          <Link
            href="/documents"
            className="card-rise group relative block min-h-[200px] rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.20] hover:bg-white/[0.05] sm:p-7"
            data-testid="action-document-library"
          >
            <div className="flex h-full flex-col">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.14] bg-white/[0.06] text-white">
                  <Files className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8e8e93]">Evidence</span>
              </div>
              <h3 className="text-[24px] font-semibold leading-[1.1] text-white sm:text-[26px]" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}>
                Document Library
              </h3>
              <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-[#a1a1a6]">
                Reopen uploaded evidence, see what was extracted, and review anything the parser could not read.
              </p>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[13px] font-medium text-[#d1d1d6] transition-colors group-hover:text-white">
                Browse documents <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>

          {esgAllowed && (
          <Link
            href="/esg/clients"
            className="card-rise group relative block rounded-2xl p-6 sm:p-7 min-h-[200px] overflow-hidden border border-emerald-400/20 hover:border-emerald-300/40 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_60px_-20px_rgba(29,233,160,0.25)] cursor-pointer"
            style={{
              backgroundImage:
                'linear-gradient(135deg, rgba(29,233,160,0.12) 0%, rgba(29,233,160,0.04) 40%, rgba(255,255,255,0.02) 100%)',
            }}
            data-testid="action-create-esg"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-5">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/35 text-emerald-200 flex items-center justify-center">
                  <Leaf className="w-5 h-5" strokeWidth={2.2} />
                </div>
                <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-emerald-200/70">
                  ESG
                </span>
              </div>
              <h3
                className="text-[24px] sm:text-[26px] font-semibold tracking-tight text-white leading-[1.1]"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
              >
                ESG Toolkit
              </h3>
              <p className="mt-2 text-[13.5px] text-[#a1a1a6] leading-relaxed max-w-md">
                Environmental, social and governance inputs, summary, and dashboard for your company.
              </p>
              <span className="mt-auto pt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-100/90 group-hover:text-white">
                Start ESG assessment
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </div>
          </Link>
          )}
        </section>

        {/* Hairline divider — gives the page rhythm */}
        <div aria-hidden className="mb-10 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />


        {/* FEATURED + ACTIVE TOOLKITS */}
        <section className="mb-12">
          <SectionHeader title="Open a toolkit" count={filteredActive.length} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {featured && (
              <FeaturedCard toolkit={featured} staggerClass="card-rise stagger-5" />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              {otherActive.map((t, i) => (
                <ActiveCard key={t.id} toolkit={t} staggerClass={`card-rise stagger-${6 + i}`} />
              ))}
              {otherActive.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/[0.06] p-6 text-center text-[12px] text-[#5a5a60] flex items-center justify-center min-h-[180px]">
                  More live toolkits coming soon.
                </div>
              )}
            </div>
          </div>
        </section>

        {filteredActive.length === 0 && (
          <div className="mt-10 rounded-2xl bg-white/[0.03] p-12 text-center border border-white/[0.06]">
            <Search className="w-8 h-8 text-[#2c2c2e] mx-auto mb-3" />
            <p className="text-[14px] text-[#636366]" data-testid="text-no-results">
              No toolkits match "{searchQuery}".
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------------- Subcomponents ---------------- */

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-end justify-between mb-5">
      <h2 className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-[0.18em]">
        {title}
      </h2>
      <span className="text-[11px] text-[#48484a] font-mono">{String(count).padStart(2, '0')}</span>
    </div>
  );
}

function FeaturedCard({ toolkit, staggerClass }: { toolkit: any; staggerClass?: string }) {
  return (
    <Link
      href={toolkit.link}
      className={`${staggerClass || ''} lg:col-span-2 group relative block rounded-2xl overflow-hidden p-6 sm:p-8 min-h-[260px]
        bg-black/40 backdrop-blur-md border border-white/[0.08] hover:border-white/[0.18] transition-all duration-300
        hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]`}
      data-testid={`card-featured-${toolkit.id}`}
    >
      {toolkit.backgroundImage && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-no-repeat bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.04]"
            style={{ backgroundImage: `url(${toolkit.backgroundImage})`, opacity: 0.85 }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(105deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.15) 100%)',
            }}
          />
        </>
      )}
      <div className="relative flex flex-col h-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="icon-rise w-10 h-10 rounded-xl bg-violet-500/[0.12] border border-violet-400/20 text-violet-300 flex items-center justify-center">
              {toolkit.icon}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-[#a1a1a6] border border-white/[0.08] bg-white/[0.03] tracking-wider">
                {toolkit.tag}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#a1a1a6]">
                <Sparkles className="w-2.5 h-2.5" /> {toolkit.aiBadge}
              </span>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#a1a1a6]">
            <span className="w-1.5 h-1.5 rounded-full bg-white/70 pulse-soft"></span>
            Live
          </span>
        </div>
        <h3
          className="mt-6 text-[26px] sm:text-[32px] font-semibold leading-[1.08] tracking-tight text-white max-w-2xl"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
        >
          {toolkit.title}
        </h3>
        <p className="mt-3 text-[13.5px] text-[#a1a1a6] leading-relaxed max-w-2xl">
          {toolkit.description}
        </p>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          {toolkit.features?.map((f: string, i: number) => (
            <li key={i} className="flex items-center gap-1.5 text-[12px] text-[#8e8e93]">
              <span className="w-1 h-1 rounded-full bg-white/40"></span>
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-6 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-white">
            Open toolkit
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
          <span className="text-[10px] font-mono text-[#48484a]">FEATURED</span>
        </div>
      </div>
    </Link>
  );
}

function ActiveCard({ toolkit, staggerClass }: { toolkit: any; staggerClass?: string }) {
  return (
    <Link
      href={toolkit.link}
      className={`${staggerClass || ''} group relative block rounded-2xl p-5 bg-black/40 backdrop-blur-md border border-white/[0.07]
        hover:border-white/[0.16] hover:bg-black/50 transition-all duration-250
        hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.5)] min-h-[180px] flex flex-col`}
      data-testid={`card-toolkit-${toolkit.id}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="icon-rise w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[#d1d1d6] flex items-center justify-center group-hover:bg-white/[0.08] group-hover:border-white/[0.14] group-hover:text-white smooth">
          {toolkit.icon}
        </div>
        <div className="flex items-center gap-1.5">
          {toolkit.aiBadge && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#8e8e93]">
              <Sparkles className="w-2.5 h-2.5" /> {toolkit.aiBadge}
            </span>
          )}
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-[#8e8e93] border border-white/[0.08] bg-white/[0.03] tracking-wider">
            {toolkit.tag}
          </span>
        </div>
      </div>
      <h3 className="text-[15px] font-semibold tracking-tight text-white">{toolkit.title}</h3>
      <p className="mt-1.5 text-[12.5px] text-[#8e8e93] leading-relaxed line-clamp-2">
        {toolkit.description}
      </p>
      {toolkit.features && toolkit.features.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {toolkit.features.slice(0, 2).map((f: string, i: number) => (
            <li key={i} className="flex items-center gap-1.5 text-[11.5px] text-[#636366]">
              <span className="w-1 h-1 rounded-full bg-white/30 shrink-0"></span>
              {f}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#a1a1a6]">
          <span className="w-1.5 h-1.5 rounded-full bg-white/70 pulse-soft"></span> Live
        </span>
        <ChevronRight className="w-4 h-4 text-[#636366] group-hover:text-white group-hover:translate-x-0.5 smooth" />
      </div>
    </Link>
  );
}

