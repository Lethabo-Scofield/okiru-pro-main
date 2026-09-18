import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@toolkit/lib/auth';
import { checkOnboardingGate } from '@/lib/onboardingStatus';
import { Award, Leaf, ShieldCheck, FolderOpen, ArrowRight, X } from 'lucide-react';
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
  const { allowed: esgAllowed } = useEsgAccess();
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
      show: true,
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
      show: esgAllowed,
    },
  ].filter((p) => p.show);

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
    <div className="font-sans" data-testid="page-hub">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <div className="ok-eyebrow mb-2">Compliance suite</div>
          <h1 className="ok-title-lg">{companyName || 'Okiru'}</h1>
          <p className="ok-subtitle mt-2 max-w-xl">
            Choose a product to see the companies you are working on.
          </p>
        </div>

        {!profileLoading && needsProfile && reminderVisible && (
          <div
            className="ok-panel flex items-start justify-between gap-4 px-4 py-3 mb-6"
            data-testid="profile-reminder"
          >
            <p className="ok-subtitle">
              Your company profile is incomplete.{' '}
              <Link
                href={companyProfilePath('/hub')}
                className="text-white underline underline-offset-4"
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
              className="text-[color:var(--muted)] hover:text-[color:var(--body)] transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {(continueBbbee || (esgAllowed && continueEsg)) && (
          <div className="mb-7">
            <div className="ok-eyebrow mb-2">
              Continue where you left off
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {continueBbbee && (
                <button
                  type="button"
                  onClick={() => navigate('/bbbee/new')}
                  className="flex items-center justify-between gap-3 ok-panel ok-panel-action px-4 py-3 text-left"
                  data-testid="continue-bbbee"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium truncate">
                      {continueBbbee.name || 'B-BBEE scorecard'}
                    </span>
                    <span className="block text-[11px] text-[color:var(--body)] mt-0.5">
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
                  className="flex items-center justify-between gap-3 ok-panel ok-panel-action px-4 py-3 text-left"
                  data-testid="continue-esg"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium truncate">
                      {continueEsg.name || 'ESG scorecard'}
                    </span>
                    <span className="block text-[11px] text-[color:var(--body)] mt-0.5">
                      ESG{continueEsg.saved ? ` · saved ${continueEsg.saved}` : ''}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Products on the left, what you were last working on beside them, so
            the page is wide enough to hold both and there is something on it. */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px] mb-8">
          {products.map((p) => (
            <section
              key={p.id}
              className="ok-panel relative overflow-hidden p-6 flex flex-col"
              data-testid={`product-${p.id}`}
            >
              <span
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: p.hue, opacity: 0.7 }}
                aria-hidden
              />
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-[10px]"
                    style={{
                      color: p.hue,
                      background: `color-mix(in srgb, ${p.hue} 14%, transparent)`,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${p.hue} 28%, transparent)`,
                    }}
                  >
                    {p.icon}
                  </span>
                  <h2
                    className="text-[17px] font-semibold tracking-[-0.015em]"
                    style={{ color: 'var(--hi)' }}
                  >
                    {p.title}
                  </h2>
                </div>
                {/* The number is the point: how many companies are in here. */}
                <div className="text-right shrink-0">
                  <div
                    className="ok-num text-[26px] font-semibold leading-none"
                    style={{ color: 'var(--hi)' }}
                    data-testid={`count-${p.id}`}
                  >
                    {clientsLoading ? '—' : p.count}
                  </div>
                  <div className="ok-eyebrow mt-1.5">
                    {p.count === 1 ? 'company' : 'companies'}
                  </div>
                </div>
              </div>
              <p className="ok-subtitle mt-4 flex-1">{p.description}</p>
              <div className="flex items-center gap-2 mt-6">
                <Link href={p.workspace} className="ok-btn-primary" data-testid={`open-${p.id}`}>
                  Open workspace
                </Link>
                <Link href={p.create} className="ok-btn" data-testid={`create-${p.id}`}>
                  Create scorecard
                </Link>
              </div>
            </section>
          ))}

          <section className="ok-panel-flush flex flex-col" data-testid="recent-companies">
            <div
              className="px-4 py-3"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <span className="ok-eyebrow">Recently worked on</span>
            </div>
            <div className="flex-1">
              {clientsLoading ? (
                <div className="px-4 py-6 text-[13px] text-[color:var(--muted)]">Loading</div>
              ) : recent.length === 0 ? (
                <div className="px-4 py-6">
                  <p className="text-[13px] text-[color:var(--body)]">
                    Nothing yet. Create a scorecard and it will appear here.
                  </p>
                </div>
              ) : (
                recent.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openCompany(c)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                    data-testid={`recent-${c.id}`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: c.isEsg ? 'var(--esg)' : 'var(--bbbee)' }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-[13px] font-medium truncate"
                        style={{ color: 'var(--hi)' }}
                      >
                        {c.name}
                      </span>
                      <span className="block ok-eyebrow mt-0.5">
                        {c.isEsg ? 'ESG' : 'B-BBEE'}
                      </span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[color:var(--muted)]" />
                  </button>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="ok-eyebrow mb-2">Also available</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {alsoAvailable.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className="flex items-start gap-3 ok-panel ok-panel-action px-4 py-3"
              data-testid={`tool-${t.id}`}
            >
              <span className="text-[color:var(--body)] mt-0.5">{t.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium" style={{ color: 'var(--hi)' }}>
                  {t.title}
                </span>
                <span className="block text-[12px] text-[color:var(--body)] mt-0.5">
                  {t.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
