import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@toolkit/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { checkOnboardingGate } from '@/lib/onboardingStatus';
import { gatedAuthPath } from '@/lib/authRoutes';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  ChevronRight, Search, X, ArrowUpRight, Lock, Building2,
  BarChart3, Award, Leaf, Users, BookOpen, Briefcase, ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { UserAccountMenu, companyProfilePath } from '@/components/UserAccountMenu';
import { Crown } from 'lucide-react';
import { isSkippedCompanyProfileName } from '@/lib/profilePlaceholder';

interface CompanyProfile {
  companyName?: string;
  beeLevel?: string | null;
}
interface WorkspaceLite { id: string; name: string }
interface MemberLite { id: string; userId: string }
interface InviteLite { id: string; acceptedAt: string | null; revokedAt: string | null; expiresAt: string }

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
  const { toast } = useToast();
  const [location, navigate] = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [stats, setStats] = useState<{ teamCount: number; pendingInvites: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

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
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setStatsLoading(true);
      try {
        const wsRes = await fetch('/api/workspaces', { credentials: 'include' });
        const wsData = await wsRes.json().catch(() => ({}));
        const ws: WorkspaceLite[] = wsData.workspaces || [];
        if (ws.length === 0) {
          if (!cancelled) setStats({ teamCount: 1, pendingInvites: 0 });
          return;
        }
        const id = ws[0].id;
        const [mRes, iRes] = await Promise.all([
          fetch(`/api/workspaces/${id}/members`, { credentials: 'include' }),
          fetch(`/api/workspaces/${id}/invites`, { credentials: 'include' }),
        ]);
        const mData = await mRes.json().catch(() => ({}));
        const iData = await iRes.json().catch(() => ({}));
        const members: MemberLite[] = mData.members || [];
        const invites: InviteLite[] = iData.invites || [];
        const pending = invites.filter(
          (i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt).getTime() > Date.now(),
        ).length;
        if (!cancelled) setStats({ teamCount: members.length, pendingInvites: pending });
      } catch {
        if (!cancelled) setStats({ teamCount: 1, pendingInvites: 0 });
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleComingSoon = () => {
    toast({ title: 'Coming Soon', description: 'This toolkit is currently in development.' });
  };

  const toolkits = useMemo(() => ([
    {
      id: 'bbbee-scorecard',
      title: 'B-BBEE Scorecard Calculator',
      description:
        'Model your scorecard across all five elements - Ownership, Management Control, Skills Development, Enterprise Development, and Socio-Economic Development.',
      tag: 'B-BBEE',
      aiBadge: 'AI-Scored',
      icon: <BarChart3 className="w-5 h-5" />,
      link: '/dashboard',
      features: ['Automatic level determination', 'Scenario modelling & what-if', 'DTI Codes compliant'],
      featured: true,
    },
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
      featured: false,
    },
    {
      id: 'esg', title: 'ESG Toolkit', tag: 'ESG', aiBadge: 'AI-Insights',
      icon: <Leaf className="w-4 h-4" />, action: handleComingSoon,
      description: 'Carbon, social and governance reporting aligned to GRI, TCFD and SASB.',
    },
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), []);

  const active = toolkits.filter((t) => 'link' in t && t.link);
  const upcoming = toolkits.filter((t) => !('link' in t) || !t.link);
  const suiteModuleTotal = toolkits.length;
  const suiteLiveCount = active.length;

  const filteredActive = searchQuery.trim()
    ? active.filter((t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tag.toLowerCase().includes(searchQuery.toLowerCase()))
    : active;

  const filteredUpcoming = searchQuery.trim()
    ? upcoming.filter((t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tag.toLowerCase().includes(searchQuery.toLowerCase()))
    : upcoming;

  const featured = filteredActive.find((t: any) => t.featured) || filteredActive[0];
  const otherActive = filteredActive.filter((t) => t.id !== featured?.id);

  const displayName = firstName(user?.fullName, user?.username);
  const companyName = profile?.companyName || user?.organizationName || null;
  const companyNameFriendly =
    companyName && isSkippedCompanyProfileName(companyName)
      ? "Your company (add details anytime)"
      : companyName;
  const beeLevel = profile?.beeLevel || null;
  const beeLevelSub =
    profileLoading ? '' : beeLevel
      ? 'Current rating'
      : 'Add from your profile';

  return (
    <div
      className="font-sans min-h-screen bg-black relative overflow-x-hidden"
      style={{ letterSpacing: '-0.011em', color: '#f5f5f7' }}
    >
      {/* Single, very subtle purple wash - quiet brand signal, nothing more */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 w-[760px] h-[760px] rounded-full opacity-[0.10] blur-[140px] float-soft"
        style={{
          background: 'radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(168,85,247,0) 70%)',
          transform: 'translate(-50%, 0)',
        }}
      />

      {/* Top progress bar - visible while initial profile/stats are loading */}
      {(profileLoading || statsLoading || authLoading) && (
        <div className="top-progress" aria-hidden data-testid="top-progress" />
      )}

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
            <button
              onClick={() => navigate('/workspace')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/15 border border-violet-400/35 hover:bg-violet-500/25 hover:border-violet-300/45 smooth press-sm text-violet-100 shadow-sm shadow-violet-950/20"
              title="Workspace — invite people and manage your team"
              aria-label="Workspace — invite people and manage your team"
              data-testid="btn-workspace"
            >
              <Building2 className="h-3.5 w-3.5" />
              <span className="text-[12px] font-semibold">Workspace</span>
            </button>
            <button
              onClick={() => setSearchOpen((s) => !s)}
              className="hidden sm:inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] smooth press-sm text-[#8e8e93] hover:text-white text-[12px]"
              title="Search toolkits (⌘K)"
              data-testid="btn-search-toolkits"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
              <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.06] text-[10px] font-mono text-[#8e8e93]">
                ⌘K
              </kbd>
            </button>
            <button
              onClick={() => setSearchOpen((s) => !s)}
              className="sm:hidden p-2 rounded-full bg-white/[0.04] hover:bg-white/[0.08] smooth press-sm text-[#8e8e93] hover:text-white"
              title="Search toolkits"
              data-testid="btn-search-toolkits-mobile"
            >
              <Search className="h-4 w-4" />
            </button>
            {user?.role === 'admin' && (
              <Link
                href="/admin/users"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] smooth press-sm text-[#8e8e93] hover:text-white text-[12px] font-medium"
                data-testid="link-admin-users"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </Link>
            )}
            {user?.role === 'super_admin' && (
              <Link
                href="/super-admin"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 smooth press-sm text-amber-300 hover:text-amber-200 text-[12px] font-medium"
                data-testid="link-super-admin"
              >
                <Crown className="h-3.5 w-3.5" />
                Super Admin
              </Link>
            )}
            {user?.id && !authLoading ? <UserAccountMenu variant="hub" /> : null}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div
          className="w-full px-4 sm:px-6 lg:px-8 py-3 bg-black/60 backdrop-blur-md"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#48484a]" />
            <input
              type="text"
              placeholder="Search toolkits..."
              autoFocus
              className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.12] pl-11 pr-10 py-3 text-[14px] text-white outline-none focus:ring-2 focus:ring-white/20 focus:border-white/[0.18] smooth placeholder:text-[#48484a]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-toolkits"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#636366] hover:text-white smooth"
                data-testid="btn-clear-search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <main className="relative max-w-[1280px] mx-auto px-4 sm:px-6 pt-12 pb-20">
        {/* HERO - personalized */}
        <section className="mb-10 fade-in" data-testid="hero-welcome">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[#8e8e93] text-[10.5px] font-semibold tracking-[0.14em] uppercase mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/60"></span>
            Compliance Suite · ZA
          </div>
          <h1
            className="text-[36px] leading-[1.05] sm:text-[52px] font-semibold tracking-tight text-white"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
          >
            {greeting()},{' '}
            {authLoading ? (
              <span className="skel inline-block h-[36px] w-40 align-middle rounded-md" />
            ) : (
              <button
                type="button"
                onClick={() => navigate(companyProfilePath('/hub'))}
                className="text-white border-b border-dashed border-white/35 hover:border-violet-300/80 hover:text-violet-100 transition-colors pb-0.5"
                data-testid="text-greeting-name"
              >
                {displayName}
              </button>
            )}
            <span className="text-[#5a5a60]">.</span>
          </h1>
          <div className="mt-3 text-[15px] text-[#8e8e93] leading-relaxed font-light max-w-2xl lg:max-w-3xl">
            {profileLoading ? (
              <span className="inline-flex flex-col gap-1.5">
                <span className="skel h-3.5 w-72 block" />
                <span className="skel h-3.5 w-56 block" />
              </span>
            ) : companyName ? (
              <>
                You&apos;re signed in to{' '}
                <span className="text-[#d1d1d6] font-medium">{companyNameFriendly}</span>.{' '}
                <button
                  type="button"
                  onClick={() => navigate('/workspace')}
                  className="text-violet-300/95 hover:text-violet-200 underline decoration-violet-400/40 underline-offset-2 font-medium"
                  data-testid="link-hero-workspace-signed-in"
                >
                  Invite your team in Workspace
                </button>{' '}
                when you&apos;re ready, or open a toolkit below.
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/workspace')}
                  className="text-violet-300/95 hover:text-violet-200 underline decoration-violet-400/40 underline-offset-2 font-medium"
                  data-testid="link-hero-workspace-anon"
                >
                  Set up Workspace
                </button>{' '}
                for invites, or jump into a toolkit below.
              </>
            )}
          </div>
        </section>

        {/* STATS STRIP */}
        <section
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10"
          data-testid="stats-strip"
        >
          <StatTile
            label="Live modules"
            value={suiteLiveCount}
            sub={`${suiteLiveCount} of ${suiteModuleTotal} in this suite`}
            loading={false}
            staggerClass="card-rise stagger-1"
          />
          <StatTile
            label="Team members"
            value={statsLoading ? null : (stats?.teamCount ?? 1)}
            sub={statsLoading ? '' : (stats && stats.teamCount > 1 ? 'Collaborating' : 'Open Workspace')}
            loading={statsLoading}
            onClick={() => navigate('/workspace')}
            staggerClass="card-rise stagger-2"
          />
          <StatTile
            label="Pending invites"
            value={statsLoading ? null : (stats?.pendingInvites ?? 0)}
            sub={statsLoading ? '' : (stats?.pendingInvites ? 'Awaiting acceptance' : 'None waiting')}
            loading={statsLoading}
            onClick={() => navigate('/workspace')}
            staggerClass="card-rise stagger-3"
          />
          <StatTile
            label="B-BBEE level"
            value={profileLoading ? null : (beeLevel || '—')}
            sub={beeLevelSub}
            loading={profileLoading}
            accent
            onClick={
              !profileLoading && !beeLevel
                ? () => navigate(companyProfilePath('/hub'))
                : undefined
            }
            staggerClass="card-rise stagger-4"
          />
        </section>

        {/* FEATURED + ACTIVE TOOLKITS */}
        <section className="mb-12">
          <SectionHeader title="Available now" count={filteredActive.length} />
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

        {/* COMING SOON */}
        <section>
          <SectionHeader title="On the roadmap" count={filteredUpcoming.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {filteredUpcoming.map((t, i) => (
              <UpcomingCard
                key={t.id}
                toolkit={t}
                staggerClass={`card-rise stagger-${7 + Math.min(i, 3)}`}
              />
            ))}
          </div>
        </section>

        {filteredActive.length === 0 && filteredUpcoming.length === 0 && (
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

function StatTile({
  label, value, sub, loading, onClick, accent, staggerClass,
}: {
  label: string; value: string | number | null; sub: string;
  loading: boolean; onClick?: () => void; accent?: boolean; staggerClass?: string;
}) {
  const interactive = !!onClick;
  const sharedClass = `${staggerClass || ''} text-left relative rounded-2xl p-4 bg-white/[0.02] ring-1 ring-inset ring-white/[0.05] hover:ring-white/[0.12] smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${interactive ? 'press-sm cursor-pointer hover:bg-white/[0.04]' : ''}`;
  const valueColor = accent ? 'text-violet-300' : 'text-white';
  const testId = `stat-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const inner = (
    <>
      <p className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[#8e8e93]">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2 min-h-[28px]">
        {loading || value === null ? (
          <span className="skel h-6 w-12 inline-block rounded-md" />
        ) : (
          <span
            key={String(value)}
            className={`text-[24px] font-semibold tracking-tight ${valueColor} bounce-in`}
            style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
          >
            {value}
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-[#636366] min-h-[14px]">
        {loading ? <span className="skel h-2.5 w-20 inline-block align-middle" /> : sub}
      </div>
    </>
  );
  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={sharedClass} data-testid={testId}>
        {inner}
      </button>
    );
  }
  return (
    <div className={sharedClass} data-testid={testId}>
      {inner}
    </div>
  );
}

function FeaturedCard({ toolkit, staggerClass }: { toolkit: any; staggerClass?: string }) {
  return (
    <Link
      href={toolkit.link}
      className={`${staggerClass || ''} lg:col-span-2 group relative block rounded-2xl overflow-hidden p-6 sm:p-8 min-h-[260px]
        bg-white/[0.025] border border-white/[0.07] hover:border-white/[0.16] transition-all duration-300
        hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]`}
      data-testid={`card-featured-${toolkit.id}`}
    >
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
      className={`${staggerClass || ''} group relative block rounded-2xl p-5 bg-white/[0.025] border border-white/[0.06]
        hover:border-white/[0.14] hover:bg-white/[0.04] transition-all duration-200
        hover:-translate-y-0.5 min-h-[180px] flex flex-col`}
      data-testid={`card-toolkit-${toolkit.id}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="icon-rise w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[#d1d1d6] flex items-center justify-center group-hover:bg-white/[0.08] group-hover:border-white/[0.14] group-hover:text-white smooth">
          {toolkit.icon}
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-[#8e8e93] border border-white/[0.08] bg-white/[0.03] tracking-wider">
          {toolkit.tag}
        </span>
      </div>
      <h3 className="text-[15px] font-semibold tracking-tight text-white">{toolkit.title}</h3>
      <p className="mt-1.5 text-[12.5px] text-[#8e8e93] leading-relaxed line-clamp-3">
        {toolkit.description}
      </p>
      <div className="mt-auto pt-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#a1a1a6]">
          <span className="w-1.5 h-1.5 rounded-full bg-white/70 pulse-soft"></span> Live
        </span>
        <ChevronRight className="w-4 h-4 text-[#636366] group-hover:text-white group-hover:translate-x-0.5 smooth" />
      </div>
    </Link>
  );
}

function UpcomingCard({ toolkit, staggerClass }: { toolkit: any; staggerClass?: string }) {
  return (
    <button
      onClick={toolkit.action}
      className={`${staggerClass || ''} text-left group relative rounded-xl p-4 bg-white/[0.015] border border-white/[0.04]
        hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-200 min-h-[130px] flex flex-col`}
      data-testid={`card-toolkit-${toolkit.id}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[#636366] flex items-center justify-center">
          {toolkit.icon}
        </div>
        <Lock className="w-3 h-3 text-[#3a3a3c]" />
      </div>
      <h3 className="text-[13.5px] font-medium tracking-tight text-[#d1d1d6] leading-snug">
        {toolkit.title}
      </h3>
      <p className="mt-1 text-[11.5px] text-[#636366] leading-relaxed line-clamp-2">
        {toolkit.description}
      </p>
      <div className="mt-auto pt-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#48484a]">
          {toolkit.tag}
        </span>
        <span className="text-[10px] text-[#48484a] group-hover:text-[#8e8e93] smooth">Notify me</span>
      </div>
    </button>
  );
}
