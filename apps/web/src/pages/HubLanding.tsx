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

interface CompanyProfile {
  companyName?: string;
  beeLevel?: string | null;
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
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8">
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

        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          {products.map((p) => (
            <section
              key={p.id}
              className="ok-panel ok-panel-action relative overflow-hidden p-6 flex flex-col"
              data-testid={`product-${p.id}`}
            >
              <span
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: p.hue, opacity: 0.7 }}
                aria-hidden
              />
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
                <h2 className="text-[17px] font-semibold tracking-[-0.015em]" style={{ color: 'var(--hi)' }}>
                  {p.title}
                </h2>
              </div>
              <p className="ok-subtitle mt-3.5 flex-1">{p.description}</p>
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
        </div>

        <div className="ok-eyebrow mb-2">
          Also available
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {alsoAvailable.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className="flex items-start gap-3 ok-panel ok-panel-action px-4 py-3"
              data-testid={`tool-${t.id}`}
            >
              <span className="text-[color:var(--body)] mt-0.5">{t.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-white">{t.title}</span>
                <span className="block text-[12px] text-[color:var(--body)] mt-0.5">{t.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
