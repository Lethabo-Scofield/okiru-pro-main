import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@toolkit/lib/auth';
import { checkOnboardingGate } from '@/lib/onboardingStatus';
import { Award, Leaf, ShieldCheck, ArrowRight, X, LockKeyhole } from 'lucide-react';
import { companyProfilePath } from '@/components/UserAccountMenu';
import { useEsgAccess } from '@/hooks/useEsgAccess';
// Light snapshot peeks (type-only deps) — the create flows write these when a
// paid extraction completes, and the Hub offers the way back to them.
import { readFlowSnapshot } from '@/components/scorecard/flowSnapshot';
import { readEsgFlowSnapshot } from '@/components/esg/esgFlowSnapshot';
import { gatedAuthPath } from '@/lib/authRoutes';
import { isSkippedCompanyProfileName } from '@/lib/profilePlaceholder';

interface CompanyProfile {
  companyName?: string;
  beeLevel?: string | null;
}

interface HubClient {
  clientId?: string;
  id?: string;
  name?: string;
  product?: string;
}

function HubSkeleton({ className }: { className: string }) {
  return (
    <span
      className={`block animate-pulse rounded-full bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] ${className}`}
      aria-hidden
    />
  );
}

function YellowFolderMark() {
  return (
    <span className="relative block h-8 w-10" aria-hidden>
      <span className="absolute left-1 top-1 h-2.5 w-6 rounded-t-[5px] bg-[#f8c84a] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]" />
      <span className="absolute inset-x-0 bottom-0 h-6 rounded-[7px] bg-gradient-to-b from-[#ffd96a] to-[#f2ad2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_10px_18px_-14px_rgba(111,69,9,0.8)]" />
      <span className="absolute inset-x-1 bottom-1 h-3 rounded-[5px] bg-white/18" />
    </span>
  );
}

/**
 * The suite home: two products, and the two things that serve both.
 *
 * It used to be a photograph, a violet glow, a greeting that changed with the
 * clock, and three peer buttons — Create Scorecard, View Scorecard, ESG Toolkit
 * — which is not a shape anyone could read as "the B-BBEE section and the ESG
 * section". Corporate clients said it felt unserious and hard to navigate.
 *
 * Each product is now one door onto the companies you carry for it. The shell
 * around this page owns the rail, the breadcrumbs and the account menu, so this
 * page is only what sits beneath them.
 */
export default function HubLanding() {
  const { user } = useAuth();
  const { allowed: esgAllowed, loading: esgAccessLoading } = useEsgAccess();
  const [location, navigate] = useLocation();

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [reminderVisible, setReminderVisible] = useState(() => {
    try {
      return sessionStorage.getItem('okiru:profile-reminder-hidden') !== '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        const gate = await checkOnboardingGate();
        if (cancelled) return;
        // Not signed in (expired session, or a cookie bound to another host):
        // the Hub cannot render for this user, so send them to sign in.
        if (gate.status === 'unauthenticated') {
          const safe =
            location.startsWith('/') && !location.startsWith('//') && location !== '/onboarding' && location !== '/auth'
              ? location
              : '/hub';
          navigate(gatedAuthPath({ redirect: safe }), { replace: true });
          return;
        }
        // The company profile is optional: an incomplete one shows a reminder,
        // it never blocks the Hub.
        if (gate.status === 'needs-onboarding') {
          setProfile(null);
          setNeedsProfile(true);
          return;
        }
        setNeedsProfile(false);
        const p = gate.profile;
        setProfile({
          companyName: typeof p?.companyName === 'string' ? p.companyName : undefined,
          beeLevel: p?.beeLevel === null || p?.beeLevel === undefined ? null : String(p.beeLevel),
        });
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, location, navigate]);

  /** A short "12 Mar 10:42" label, or empty when the timestamp is unreadable. */
  const savedLabel = (iso: string | undefined): string => {
    if (!iso) return '';
    const at = new Date(iso);
    return Number.isNaN(at.getTime())
      ? ''
      : at.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  // Paid extractions waiting in this tab. Read once per visit — the create
  // flows own writing and clearing; the Hub only offers the way back in.
  const continueBbbee = useMemo(() => {
    const snap = readFlowSnapshot();
    if (!snap) return null;
    return { name: snap.companyName?.trim() ?? '', saved: savedLabel(snap.savedAt) };
  }, []);
  const continueEsg = useMemo(() => {
    const snap = readEsgFlowSnapshot();
    if (!snap) return null;
    return { name: snap.entityName?.trim() ?? '', saved: savedLabel(snap.savedAt) };
  }, []);

  const companyName =
    profile?.companyName && !isSkippedCompanyProfileName(profile.companyName)
      ? profile.companyName.trim()
      : '';

  /**
   * The companies this person actually carries.
   *
   * The Hub was two cards and a lot of space: it described the products
   * without saying anything about the work in them, so there was nothing to
   * come back to it for. Counts make it a place you can start from rather
   * than pass through.
   */
  const [clients, setClients] = useState<HubClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/clients', { credentials: 'include' });
        const rows = res.ok ? await res.json() : [];
        if (!cancelled) setClients(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setClients([]);
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const counts = useMemo(() => {
    const esg = clients.filter((c) => c.product === 'esg').length;
    return { bbbee: clients.length - esg, esg };
  }, [clients]);

  /**
   * Each product keeps its own colour, used the way a bank uses colour: to tell
   * two products apart at a glance, on the icon and a hairline, against a
   * neutral surface. Not as a wash, a gradient or a glow — that is what read as
   * unserious before. Violet has been B-BBEE's colour and teal ESG's throughout
   * the toolkits, so the Hub now agrees with them instead of being grey.
   */
  const products = [
    {
      id: 'bbbee',
      title: 'B-BBEE',
      icon: <Award className="h-5 w-5" />,
      description:
        'Measure a company against its sector scorecard, from evidence through to a verified level.',
      workspace: '/bbbee',
      create: '/bbbee/new',
      hue: 'var(--bbbee)',
      count: counts.bbbee,
      available: true,
    },
    {
      id: 'esg',
      title: 'ESG',
      icon: <Leaf className="h-5 w-5" />,
      description:
        'Report environmental, social and governance performance against the frameworks you follow.',
      workspace: '/esg',
      create: '/esg/new',
      hue: 'var(--esg)',
      count: counts.esg,
      available: esgAllowed,
    },
  ];

  const alsoAvailable = [
    {
      id: 'certificates',
      title: 'Certificate Hub',
      icon: <ShieldCheck className="h-4 w-4" />,
      description: 'Verify and track B-BBEE certificates across your suppliers.',
      href: '/certificates',
    },
    {
      id: 'documents',
      title: 'Document library',
      icon: <YellowFolderMark />,
      description: 'Every document you have uploaded, filed under the company it belongs to.',
      href: '/documents',
    },
  ];

  return (
    <div
      className="min-h-[calc(100vh-3rem)] bg-white bg-cover bg-center bg-no-repeat font-sans text-[color:var(--hi)]"
      style={{ backgroundImage: "url('/hub-background.png')" }}
      data-testid="page-hub"
    >
      <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-8 flex flex-col gap-4 px-1 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">Workspace</div>
            <h1 className="text-[30px] font-semibold leading-tight tracking-normal text-[color:var(--hi)]">
              {companyName || 'Okiru'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--body)]">
              Select a compliance product or open a shared workspace tool.
            </p>
          </div>
          <div className="flex w-fit items-center gap-5 text-sm text-[color:var(--body)]" aria-label="Workspace summary" aria-busy={clientsLoading}>
            <span className="inline-flex min-w-[86px] items-center gap-1.5">
              {clientsLoading ? (
                <HubSkeleton className="h-4 w-16" />
              ) : (
                <>
                  <strong className="font-semibold text-[color:var(--hi)]">{clients.length}</strong> companies
                </>
              )}
            </span>
            <span className="h-4 w-px bg-[color:var(--rule-strong)]" aria-hidden />
            <span><strong className="font-semibold text-[color:var(--hi)]">2</strong> products</span>
          </div>
        </div>

        {!profileLoading && needsProfile && reminderVisible && (
          <div
            className="mb-6 flex items-start justify-between gap-4 rounded-[8px] border border-white/65 bg-white/70 px-4 py-3 shadow-[0_14px_34px_-28px_rgba(24,24,27,0.42)] backdrop-blur-xl"
            data-testid="profile-reminder"
          >
            <p className="text-sm text-[color:var(--body)]">
              Your company profile is incomplete.{' '}
              <Link
                href={companyProfilePath('/hub')}
                className="font-medium text-[color:var(--hi)] underline underline-offset-4"
              >
                Complete it
              </Link>{' '}
              to add 500 tokens to your balance.
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                setReminderVisible(false);
                try {
                  sessionStorage.setItem('okiru:profile-reminder-hidden', '1');
                } catch {
                  /* a dismissal we cannot remember is not worth failing over */
                }
              }}
              className="shrink-0 text-[color:var(--muted)] transition-colors hover:text-[color:var(--hi)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {(continueBbbee || (esgAllowed && continueEsg)) && (
          <div className="mb-7">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
              Continue where you left off
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {continueBbbee && (
                <button
                  type="button"
                  onClick={() => navigate('/bbbee/new')}
                  className="flex items-center justify-between gap-3 rounded-[8px] border border-white/55 bg-white/38 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_16px_36px_-30px_rgba(24,24,27,0.48)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white/52"
                  data-testid="continue-bbbee"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium truncate">
                      {continueBbbee.name || 'B-BBEE scorecard'}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[color:var(--body)]">
                      B-BBEE{continueBbbee.saved ? ` · saved ${continueBbbee.saved}` : ''}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                </button>
              )}
              {esgAllowed && continueEsg && (
                <button
                  type="button"
                  onClick={() => navigate('/esg/new')}
                  className="flex items-center justify-between gap-3 rounded-[8px] border border-white/55 bg-white/38 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_16px_36px_-30px_rgba(24,24,27,0.48)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white/52"
                  data-testid="continue-esg"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium truncate">
                      {continueEsg.name || 'ESG scorecard'}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[color:var(--body)]">
                      ESG{continueEsg.saved ? ` · saved ${continueEsg.saved}` : ''}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                </button>
              )}
            </div>
          </div>
        )}

        <section aria-labelledby="products-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="products-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
              Compliance products
            </h2>
            <span className="text-xs text-[color:var(--muted)]">Choose where to work</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
          {products.map((p) => (
            <section
              key={p.id}
              className={`relative flex min-h-[250px] flex-col overflow-hidden rounded-[8px] border p-6 transition hover:-translate-y-0.5 ${
                p.id === 'esg'
                  ? 'border-white/70 bg-white/72 shadow-[0_24px_58px_-48px_rgba(24,24,27,0.62)] backdrop-blur-xl hover:bg-white/82 hover:shadow-[0_28px_70px_-52px_rgba(24,24,27,0.72)]'
                  : 'border-white/55 bg-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_24px_58px_-48px_rgba(24,24,27,0.68)] backdrop-blur-2xl hover:bg-white/42 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_28px_70px_-52px_rgba(24,24,27,0.72)]'
              }`}
              style={
                p.id === 'esg'
                  ? {
                      backgroundImage:
                        "linear-gradient(90deg, rgba(255,255,255,0.68) 0%, rgba(255,255,255,0.28) 46%, rgba(255,255,255,0.06) 100%), url('/hub-esg-card-background.png')",
                      backgroundPosition: 'center',
                      backgroundSize: 'cover',
                    }
                  : undefined
              }
              data-testid={`product-${p.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {p.id !== 'esg' && (
                    <span
                      className="grid h-10 w-10 place-items-center rounded-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                      style={{
                        color: p.hue,
                        background: `color-mix(in srgb, ${p.hue} 10%, white)`,
                        border: `1px solid color-mix(in srgb, ${p.hue} 24%, white)`,
                      }}
                    >
                      {p.icon}
                    </span>
                  )}
                  <div>
                    <h3 className="text-xl font-semibold tracking-normal text-[color:var(--hi)]">{p.title}</h3>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[26px] font-semibold leading-none text-[color:var(--hi)]" data-testid={`count-${p.id}`}>
                    {clientsLoading ? <HubSkeleton className="ml-auto h-7 w-9" /> : p.count}
                  </div>
                  <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted)]">
                    {p.count === 1 ? 'company' : 'companies'}
                  </div>
                </div>
              </div>
              <p className="mt-5 max-w-md flex-1 text-sm leading-6 text-[color:var(--body)]">{p.description}</p>
              {p.id === 'esg' && !esgAccessLoading && !p.available ? (
                <div className="mt-6 flex items-center gap-2 border-t border-[color:var(--rule)] pt-4 text-sm text-[color:var(--body)]" data-testid="esg-unavailable">
                  <LockKeyhole className="h-4 w-4" />
                  ESG access is not enabled for this account
                </div>
              ) : (
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <Link
                    href={p.workspace}
                    className={`inline-flex h-9 items-center gap-2 rounded-[8px] px-4 text-sm font-medium text-white shadow-[0_12px_24px_-18px_rgba(0,0,0,0.65)] transition ${
                      p.id === 'esg'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-violet-600 hover:bg-violet-700'
                    }`}
                    data-testid={`open-${p.id}`}
                  >
                    Open workspace <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href={p.create}
                    className="inline-flex h-9 items-center rounded-[8px] border border-white/55 bg-white/42 px-4 text-sm font-medium text-[color:var(--hi)] shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_10px_22px_-20px_rgba(24,24,27,0.45)] backdrop-blur-2xl transition hover:bg-white/62"
                    data-testid={`create-${p.id}`}
                  >
                    Create scorecard
                  </Link>
                </div>
              )}
              {p.id === 'esg' && esgAccessLoading && (
                <div className="mt-3 text-xs text-[color:var(--muted)]">Checking access</div>
              )}
            </section>
          ))}
          </div>
        </section>

        <div className="mt-8">
          <section aria-labelledby="tools-heading">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 id="tools-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                  Shared tools
                </h2>
                <p className="mt-1 text-xs text-[color:var(--body)]">Utilities that support both compliance workspaces.</p>
              </div>
              <span className="hidden text-xs text-[color:var(--muted)] sm:inline">2 available</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {alsoAvailable.map((t) => (
                <Link
                  key={t.id}
                  href={t.href}
                  className={`group flex min-h-[132px] rounded-[8px] border border-white/55 bg-white/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_18px_46px_-38px_rgba(24,24,27,0.56)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white/44 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_24px_56px_-42px_rgba(24,24,27,0.62)] ${
                    t.id === 'documents' ? 'items-center justify-center' : 'flex-col justify-between'
                  }`}
                  data-testid={`tool-${t.id}`}
                >
                  {t.id === 'documents' ? (
                    <span className="flex flex-col items-center gap-3 text-center">
                      {t.icon}
                      <span className="text-sm font-semibold text-[color:var(--hi)]">{t.title}</span>
                    </span>
                  ) : (
                    <>
                      <span className="flex items-start justify-between gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-white/55 bg-white/36 text-[color:var(--body)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-2xl transition group-hover:bg-white/56">{t.icon}</span>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[color:var(--hi)]" />
                      </span>
                      <span className="mt-5 block">
                        <span className="block text-sm font-semibold text-[color:var(--hi)]">{t.title}</span>
                        <span className="mt-1.5 block text-xs leading-5 text-[color:var(--body)]">{t.description}</span>
                      </span>
                    </>
                  )}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
