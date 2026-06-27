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

/** Resolve where the toolkit "Back" button should return to, honouring the origin
 *  recorded by whoever opened the toolkit (summary vs company workbook). Falls back
 *  to the Hub when no origin was set (e.g. opened from the document processor). */
function resolveToolkitBack(): { href: string; eyebrow: string; label: string; tooltip: string } {
  try {
    const raw = sessionStorage.getItem('okiru-toolkit-from');
    // Only honour the origin when it matches the client currently open in the toolkit;
    // a mismatch means the origin is stale (e.g. left over from a previous, unrelated
    // entry such as the document processor) so we fall through to the Hub.
    const activeClient = localStorage.getItem('okiru-pro-active-client') || '';
    if (raw) {
      const o = JSON.parse(raw) as { kind?: string; companyId?: string };
      if (o.companyId && o.companyId === activeClient && o.kind === 'summary') {
        return { href: `/create-scorecard/${o.companyId}/summary`, eyebrow: 'Back to', label: 'Summary', tooltip: 'Back to Summary' };
      }
      if (o.companyId && o.companyId === activeClient && o.kind === 'company') {
        return { href: `/create-scorecard/${o.companyId}`, eyebrow: 'Back to', label: 'Workbook', tooltip: 'Back to the company workbook' };
      }
    }
  } catch { /* ignore malformed origin */ }
  return { href: '/hub', eyebrow: 'Suite', label: 'Hub', tooltip: 'Back to Okiru Hub' };
}

export function Topbar() {
  const { user, logout } = useAuth();
  const client = useBbeeStore(s => s.client);
  const back = resolveToolkitBack();

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
              <AppNavBack
                onClick={() => { window.location.href = back.href; }}
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
