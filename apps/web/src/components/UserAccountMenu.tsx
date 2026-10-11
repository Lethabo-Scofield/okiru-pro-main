import { useLocation } from "wouter";
import { useAuth } from "@toolkit/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, ChevronDown, LogOut, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { TokenBalancePill } from "@/components/TokenBalancePill";

type Variant = "hub" | "dashboard" | "certificate";

export function companyProfilePath(returnTo: string): string {
  const safe =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/hub";
  return `/company-profile?returnTo=${encodeURIComponent(safe)}`;
}

type UserAccountMenuProps = {
  variant?: Variant;
  className?: string;
  /** Replaces the default name chip trigger (still wrapped for accessibility). */
  trigger?: import("react").ReactNode;
  /**
   * The token balance rides with the account chip so it appears on every page
   * that has one — which is every page with a header — without editing nine
   * layouts. Set false only where the header genuinely has no room.
   */
  showTokens?: boolean;
};

export function UserAccountMenu({ variant = "hub", className, trigger, showTokens = true }: UserAccountMenuProps) {
  const [pathname, navigate] = useLocation();
  const { user, logout } = useAuth();
  const returnPath = pathname || "/hub";
  const profileUrl = companyProfilePath(returnPath);

  const display = user?.fullName || user?.username || "Account";
  const initial = (user?.fullName || user?.username || "U").charAt(0).toUpperCase();

  const defaultTrigger =
    variant === "dashboard" ? (
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px] text-zinc-700 shadow-sm hover:bg-zinc-50 smooth press-sm"
        data-testid="user-menu"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[9px] font-semibold text-white">
          {initial}
        </span>
        <span className="font-medium max-w-[160px] truncate">{display}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[color:var(--body)]" />
      </button>
    ) : variant === "certificate" ? (
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] text-zinc-700 transition-colors hover:bg-zinc-50"
        data-testid="user-account-menu-trigger"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-semibold text-white">
          {initial}
        </span>
        <span className="font-medium max-w-[140px] truncate">{display}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[color:var(--body)]" />
      </button>
    ) : (
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1",
          "text-zinc-700 shadow-sm hover:bg-zinc-50 smooth press-sm",
        )}
        data-testid="user-chip"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">
          {initial}
        </span>
        <span className="text-[12px] font-medium pr-0.5 max-w-[120px] truncate">{display}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[color:var(--body)] shrink-0" />
      </button>
    );

  return (
    <div className="inline-flex items-center gap-2">
      {showTokens && <TokenBalancePill />}
      <DropdownMenu>
      <DropdownMenuTrigger asChild className={className}>
        {trigger ?? defaultTrigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-semibold text-foreground truncate">{display}</div>
          {user?.email ? (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</div>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            navigate("/settings");
          }}
          data-testid="menu-settings"
        >
          <Settings />
          Settings &amp; billing
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            navigate(profileUrl);
          }}
          data-testid="menu-company-profile"
        >
          <Building2 />
          Company &amp; B-BBEE profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            navigate("/workspace");
          }}
          data-testid="menu-team"
        >
          <Users />
          Team &amp; workspace
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            navigate("/auth", { replace: true });
          }}
          data-testid="menu-sign-out"
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
