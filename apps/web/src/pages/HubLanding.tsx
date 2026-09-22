import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@toolkit/lib/auth';
import { checkOnboardingGate } from '@/lib/onboardingStatus';
import { Award, Leaf, ShieldCheck, FolderOpen, ArrowRight, X, LockKeyhole } from 'lucide-react';
import { companyProfilePath } from '@/components/UserAccountMenu';
import { useEsgAccess } from '@/hooks/useEsgAccess';
// Light snapshot peeks (type-only deps) — the create flows write these when a
// paid extraction completes, and the Hub offers the way back to them.
import { readFlowSnapshot } from '@/components/scorecard/flowSnapshot';
import { readEsgFlowSnapshot } from '@/components/esg/esgFlowSnapshot';
import { gatedAuthPath } from '@/lib/authRoutes';
import { isSkippedCompanyProfileName } from '@/lib/profilePlaceholder';
import { esgSummaryHref, setEsgActiveCompany } from '@/lib/esgRoutes';

interface CompanyProfile {
  companyName?: string;
  beeLevel?: string | null;
}

interface HubClient {
  clientId?: string;
  id?: string;
  name?: string;
  product?: string;
  updatedAt?: string;
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
   * come back to it for. Counts and the most recently touched companies make
   * it a place you can start from rather than pass through.
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
   * The three most recently touched, newest first, across both products.
   *
   * Three, not six: this sits in the same row as the two product cards, and
   * a taller list stretched them to match it — leaving both cards mostly
   * empty space so the row could accommodate a list nobody asked to be that
   * long. The products are the point of this page; this is a shortcut back.
   */
  const recent = useMemo(
    () =>
      clients
        .map((c) => ({
          id: String(c.clientId ?? c.id ?? ''),
          name: String(c.name ?? 'Unnamed company'),
          isEsg: c.product === 'esg',
          updatedAt: c.updatedAt,
        }))
        .filter((c) => c.id)
        .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
        .slice(0, 3),
    [clients],
  );

  const openCompany = (c: { id: string; isEsg: boolean }) => {
    if (c.isEsg) {
      setEsgActiveCompany(c.id);
      navigate(esgSummaryHref(c.id));
      return;
    }
    localStorage.setItem('okiru-pro-active-client', c.id);
    navigate(`/create-scorecard/${encodeURIComponent(c.id)}/summary`);
  };

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
      icon: <FolderOpen className="h-4 w-4" />,
      description: 'Every document you have uploaded, filed under the company it belongs to.',
      href: '/documents',
    },
  ];

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-[#08090b] font-sans text-[color:var(--hi)]" data-testid="page-hub">
      <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-8 flex flex-col gap-4 border-b border-[color:var(--rule)] pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">Workspace</div>
            <h1 className="text-[30px] font-semibold leading-tight tracking-normal text-[color:var(--hi)]">
              {companyName || 'Okiru'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--body)]">
              Select a compliance product or return to recent company work.
            </p>
          </div>
          <div className="flex items-center gap-5 text-sm text-[color:var(--body)]" aria-label="Workspace summary">
            <span><strong className="font-semibold text-[color:var(--hi)]">{clientsLoading ? '—' : clients.length}</strong> companies</span>
            <span className="h-4 w-px bg-[color:var(--rule-strong)]" aria-hidden />
            <span><strong className="font-semibold text-[color:var(--hi)]">2</strong> products</span>
          </div>
        </div>

        {!profileLoading && needsProfile && reminderVisible && (
          <div
            className="mb-6 flex items-start justify-between gap-4 border border-[color:var(--rule)] bg-[#111216] px-4 py-3 shadow-sm"
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
                  className="flex items-center justify-between gap-3 border border-[color:var(--rule)] bg-[#111216] px-4 py-3 text-left shadow-sm transition hover:border-[color:var(--rule-strong)]"
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
                  className="flex items-center justify-between gap-3 border border-[color:var(--rule)] bg-[#111216] px-4 py-3 text-left shadow-sm transition hover:border-[color:var(--rule-strong)]"
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
              className="relative flex min-h-[250px] flex-col overflow-hidden border border-[color:var(--rule)] bg-[#111216] p-6 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.9)]"
              data-testid={`product-${p.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-[6px]"
                    style={{
                      color: p.hue,
                      background: `color-mix(in srgb, ${p.hue} 12%, #111216)`,
                      border: `1px solid color-mix(in srgb, ${p.hue} 24%, #111216)`,
                    }}
                  >
                    {p.icon}
                  </span>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted)]">Product</div>
                    <h3 className="text-xl font-semibold tracking-normal text-[color:var(--hi)]">{p.title}</h3>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[26px] font-semibold leading-none text-[color:var(--hi)]" data-testid={`count-${p.id}`}>
                    {clientsLoading ? '—' : p.count}
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
                    className="inline-flex h-9 items-center gap-2 rounded-[5px] bg-white px-4 text-sm font-medium text-[#111] transition hover:bg-[#ececea]"
                    data-testid={`open-${p.id}`}
                  >
                    Open workspace <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href={p.create}
                    className="inline-flex h-9 items-center rounded-[5px] border border-[color:var(--rule-strong)] bg-[#18191d] px-4 text-sm font-medium text-[color:var(--hi)] transition hover:bg-[#202126]"
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

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section aria-labelledby="tools-heading">
            <h2 id="tools-heading" className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
              Shared tools
            </h2>
            <div className="divide-y divide-[color:var(--rule)] border border-[color:var(--rule)] bg-[#111216]">
              {alsoAvailable.map((t) => (
                <Link
                  key={t.id}
                  href={t.href}
                  className="flex items-center gap-4 px-4 py-4 transition hover:bg-[#18191d]"
                  data-testid={`tool-${t.id}`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[5px] border border-[color:var(--rule)] text-[color:var(--body)]">{t.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[color:var(--hi)]">{t.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[color:var(--body)]">{t.description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                </Link>
              ))}
            </div>
          </section>

          <section className="border border-[color:var(--rule)] bg-[#111216]" data-testid="recent-companies" aria-labelledby="recent-heading">
            <div className="border-b border-[color:var(--rule)] px-4 py-3">
              <h2 id="recent-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">Recent work</h2>
            </div>
            <div>
              {clientsLoading ? (
                <div className="px-4 py-6 text-sm text-[color:var(--body)]">Loading companies</div>
              ) : recent.length === 0 ? (
                <div className="px-4 py-6">
                  <p className="text-sm font-medium text-[color:var(--hi)]">No recent company work</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--body)]">Create or open a scorecard to populate this list.</p>
                </div>
              ) : (
                recent.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openCompany(c)}
                    className="flex w-full items-center gap-3 border-b border-[color:var(--rule)] px-4 py-3 text-left transition last:border-0 hover:bg-[#18191d]"
                    data-testid={`recent-${c.id}`}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.isEsg ? 'var(--esg)' : 'var(--bbbee)' }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[color:var(--hi)]">{c.name}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted)]">{c.isEsg ? 'ESG' : 'B-BBEE'}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                  </button>
                ))
              )}
              </div>
            </section>
        </div>
      </div>
    </div>
  );
}
