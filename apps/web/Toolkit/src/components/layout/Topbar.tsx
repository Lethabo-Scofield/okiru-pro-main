import { useAuth } from "@toolkit/lib/auth";
import { LogOut } from "lucide-react";
import { Link } from "wouter";
import { useBbeeStore } from "@toolkit/lib/store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@toolkit/components/ui/tooltip";
import { AppNavBack } from "@/components/AppNavBack";

/**
 * Where the toolkit's "back" goes.
 *
 * It used to be read from a session key written by whoever opened the toolkit,
 * guarded against going stale by comparing it to the active company. That made
 * one page offer different ways back depending on how you arrived, and the
 * wrong one after a refresh or in a new tab — which is why the guard existed.
 *
 * It now goes up: to the company this toolkit is showing, and from there the
 * shell's breadcrumbs carry on to B-BBEE and the Hub.
 */
function resolveToolkitBack(clientId: string | undefined): {
  href: string;
  eyebrow: string;
  label: string;
  tooltip: string;
} {
  const id = clientId || localStorage.getItem('okiru-pro-active-client') || '';
  if (id) {
    return {
      href: `/create-scorecard/${encodeURIComponent(id)}`,
      eyebrow: 'Back to',
      label: 'Workbook',
      tooltip: 'Back to the company workbook',
    };
  }
  return { href: '/bbbee', eyebrow: 'Suite', label: 'B-BBEE', tooltip: 'Back to your B-BBEE companies' };
}

export function Topbar() {
  const { user, logout } = useAuth();
  const client = useBbeeStore(s => s.client);
  const back = resolveToolkitBack(client?.id);

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  const initials = (user?.fullName || user?.username || "U")
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-11 items-center justify-between border-b border-border/40 bg-background/70 backdrop-blur-xl px-6 z-50 sticky top-0" data-testid="topbar">
      <div className="flex items-center gap-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={-1} className="inline-flex">
              {/* `~` is wouter's escape from a nested router: it routes to the
                  absolute path in the parent without touching the browser.
                  This was a `window.location.href` assignment, which threw the
                  whole application away and rebuilt it to move one level up. */}
              <AppNavBack
                href={`~${back.href}`}
                eyebrow={back.eyebrow}
                label={back.label}
                variant="light"
                size="compact"
                data-testid="btn-back-platform"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">{back.tooltip}</p>
          </TooltipContent>
        </Tooltip>
        <div className="h-3.5 w-px bg-border/30" />
        <span className="text-[13px] font-medium text-foreground/70">{client.name || 'No client selected'}</span>
        {client.financialYear && (
          <span className="text-[11px] text-muted-foreground/40 font-medium">FY {client.financialYear}</span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <div className="h-3.5 w-px bg-border/40 mx-1" />
        <Link href="/profile" data-testid="link-profile">
          <div className="h-6 w-6 rounded-full bg-muted/70 flex items-center justify-center overflow-hidden cursor-pointer hover:ring-1 hover:ring-border">
            {user?.profilePicture ? (
              <img src={user.profilePicture} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[9px] font-semibold text-muted-foreground/70">{initials}</span>
            )}
          </div>
        </Link>
        <span className="text-[11px] text-muted-foreground/50 hidden lg:inline ml-1">{user?.fullName || user?.username}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors duration-200" onClick={handleLogout} data-testid="btn-topbar-logout">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Sign out</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
