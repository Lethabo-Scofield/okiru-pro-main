import { Fragment, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronRight } from 'lucide-react';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import { UserAccountMenu } from '@/components/UserAccountMenu';
import { useAuth } from '@toolkit/lib/auth';
import { isBareRoute, buildCrumbs } from './shellNav';
import '@/styles/okiru-app.css';

/**
 * One slim bar across the signed-in product. Nothing else.
 *
 * This started as a left rail listing every destination, which turned the
 * product into a content-management console: the rail competed with each
 * page's own title, and it made the Hub one item in a list rather than the
 * place you work from. The Hub is the entry point; you choose a product there
 * and go into its workspace. So the only permanent chrome is the way back and
 * the trail showing where you are.
 *
 * It mounts ABOVE the router, which matters: the toolkits run nested routers
 * that rebase every path, so a link written inside one resolves relative to it.
 * Mounted here, the bar reads absolute paths and its links go where they say.
 *
 * Routes that frame themselves — the two toolkits, sign-in, the marketing
 * site — render alone; see `isBareRoute`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  if (!user || isBareRoute(location)) return <>{children}</>;

  const crumbs = buildCrumbs(location);
  const onHub = crumbs.length === 1;

  return (
    <div className="okiru-app">
      {/* The grain sits above the wash and below everything else, so the page
          has the same surface the marketing site does. */}
      <div className="okiru-app-grain" aria-hidden />
      <header
        className="relative z-20 h-12 sticky top-0 flex items-center justify-between gap-4 px-4 sm:px-6"
        style={{
          background: 'rgba(8,9,11,0.78)',
          backdropFilter: 'blur(20px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
          borderBottom: '1px solid var(--rule)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 8px 24px -16px rgba(0,0,0,0.9)',
        }}
        data-testid="shell-topbar"
      >
        <span className="ok-rule-brand" aria-hidden />
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/hub"
            className="flex items-center gap-2 shrink-0"
            aria-label="Okiru Hub"
            data-testid="shell-home"
          >
            <img src={logoCircle} alt="" className="h-6 w-6 rounded-[6px]" />
            <span className="text-[14px] font-semibold tracking-tight" style={{ color: 'var(--hi)' }}>
              Okiru
            </span>
          </Link>

          {!onHub && (
            <>
              <span
                className="h-4 w-px shrink-0"
                style={{ background: 'var(--rule-strong)' }}
                aria-hidden
              />
              <nav aria-label="Breadcrumb" className="min-w-0">
                <ol className="flex items-center gap-1.5 min-w-0">
                  {crumbs.map((c, i) => {
                    const last = i === crumbs.length - 1;
                    return (
                      <Fragment key={`${c.label}-${i}`}>
                        {i > 0 && (
                          <ChevronRight
                            className="h-3 w-3 shrink-0"
                            style={{ color: 'var(--muted)' }}
                            aria-hidden
                          />
                        )}
                        <li className="min-w-0">
                          {c.href && !last ? (
                            <Link
                              href={c.href}
                              className="ok-eyebrow truncate transition-colors hover:!text-[rgba(255,255,255,0.75)]"
                            >
                              {c.label}
                            </Link>
                          ) : (
                            <span
                              className="ok-eyebrow truncate"
                              style={last ? { color: 'var(--hi)' } : undefined}
                              aria-current={last ? 'page' : undefined}
                            >
                              {c.label}
                            </span>
                          )}
                        </li>
                      </Fragment>
                    );
                  })}
                </ol>
              </nav>
            </>
          )}
        </div>

        <UserAccountMenu variant="dashboard" />
      </header>

      <main className="relative z-10">{children}</main>
    </div>
  );
}

export default AppShell;
