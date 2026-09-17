import { Fragment, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronRight } from 'lucide-react';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import { UserAccountMenu } from '@/components/UserAccountMenu';
import { useAuth } from '@toolkit/lib/auth';
import { isBareRoute, buildCrumbs } from './shellNav';

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
    <div className="min-h-screen bg-black text-[#f5f5f7]" style={{ letterSpacing: '-0.011em' }}>
      <header
        className="h-12 sticky top-0 z-30 bg-black border-b border-[#2c2c2e] flex items-center justify-between gap-4 px-4 sm:px-6"
        data-testid="shell-topbar"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/hub"
            className="flex items-center gap-2 shrink-0"
            aria-label="Okiru Hub"
            data-testid="shell-home"
          >
            <img src={logoCircle} alt="" className="h-6 w-6 rounded-[6px]" />
            <span className="text-[14px] font-semibold tracking-tight text-white">Okiru</span>
          </Link>

          {!onHub && (
            <>
              <span className="h-4 w-px bg-[#2c2c2e] shrink-0" aria-hidden />
              <nav aria-label="Breadcrumb" className="min-w-0">
                <ol className="flex items-center gap-1.5 text-[12px] min-w-0">
                  {crumbs.map((c, i) => {
                    const last = i === crumbs.length - 1;
                    return (
                      <Fragment key={`${c.label}-${i}`}>
                        {i > 0 && (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#48484a]" aria-hidden />
                        )}
                        <li className="min-w-0">
                          {c.href && !last ? (
                            <Link
                              href={c.href}
                              className="text-[#98989f] hover:text-white transition-colors truncate"
                            >
                              {c.label}
                            </Link>
                          ) : (
                            <span
                              className={last ? 'text-white font-medium truncate' : 'text-[#98989f] truncate'}
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

      <main>{children}</main>
    </div>
  );
}

export default AppShell;
