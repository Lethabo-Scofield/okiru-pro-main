import { Fragment, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Award,
  Leaf,
  Grid3X3,
  FolderOpen,
  ShieldCheck,
  Users,
  Settings as SettingsIcon,
  ChevronRight,
} from 'lucide-react';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import { UserAccountMenu } from '@/components/UserAccountMenu';
import { useAuth } from '@toolkit/lib/auth';
import { useEsgAccess } from '@/hooks/useEsgAccess';
import { SHELL_NAV, isBareRoute, buildCrumbs, activeNavId } from './shellNav';

const ICONS: Record<string, typeof Award> = {
  Award,
  Leaf,
  Grid3X3,
  FolderOpen,
  ShieldCheck,
  Users,
  Settings: SettingsIcon,
};

/**
 * The frame the signed-in product sits in.
 *
 * Every page used to draw its own header — a different height, a different
 * back button, a different idea of where "back" went. Navigation was therefore
 * something you re-learned per page, and from inside either toolkit there was
 * either no way to the Hub at all or one that reloaded the browser.
 *
 * This mounts ABOVE the router, which matters: the toolkits run nested routers
 * that rebase every path, so a link written inside one resolves relative to it.
 * Mounted here, the shell reads absolute paths and its links go where they say.
 *
 * Routes that own their chrome (the two toolkits, sign-in, the marketing site)
 * render alone — see `isBareRoute`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { allowed: esgAllowed } = useEsgAccess();

  // Signed out, or on a screen that frames itself: hand the page straight back.
  if (!user || isBareRoute(location)) return <>{children}</>;

  const activeId = activeNavId(location);
  const crumbs = buildCrumbs(location);

  return (
    <div className="min-h-screen bg-black text-[#f5f5f7]" style={{ letterSpacing: '-0.011em' }}>
      <div className="flex min-h-screen">
        <nav
          className="hidden lg:flex w-[216px] shrink-0 flex-col border-r border-[#2c2c2e] bg-[#0a0a0a] sticky top-0 h-screen"
          aria-label="Main"
          data-testid="shell-rail"
        >
          <Link
            href="/hub"
            className="flex items-center gap-2.5 px-4 h-12 border-b border-[#2c2c2e] shrink-0"
          >
            <img src={logoCircle} alt="" className="h-6 w-6 rounded-[6px]" />
            <span className="text-[14px] font-semibold tracking-tight text-white">Okiru</span>
          </Link>

          <div className="flex-1 overflow-y-auto py-3">
            {SHELL_NAV.map((section) => {
              const items = section.items.filter((i) => !i.esgOnly || esgAllowed);
              if (items.length === 0) return null;
              return (
                <div key={section.id} className="mb-5">
                  <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#636366]">
                    {section.label}
                  </div>
                  {items.map((item) => {
                    const Icon = ICONS[item.icon] ?? Grid3X3;
                    const isActive = activeId === item.id;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        data-testid={`shell-nav-${item.id}`}
                        className={`flex items-center gap-2.5 mx-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                          isActive
                            ? 'bg-white/[0.10] text-white font-medium'
                            : 'text-[#98989f] hover:bg-white/[0.05] hover:text-[#e5e5e7]'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0 flex flex-col">
          <header
            className="h-12 shrink-0 sticky top-0 z-30 bg-black border-b border-[#2c2c2e] flex items-center justify-between gap-4 px-4 sm:px-6"
            data-testid="shell-topbar"
          >
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

            <div className="flex items-center gap-2 shrink-0">
              <UserAccountMenu variant="dashboard" />
            </div>
          </header>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
