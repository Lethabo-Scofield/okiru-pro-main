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
import { Building2, ChevronDown, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

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
};

export function UserAccountMenu({ variant = "hub", className, trigger }: UserAccountMenuProps) {
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
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c1c1e] text-[12px] text-[#d1d1d6] hover:bg-[#2c2c2e] smooth press-sm"
        data-testid="user-menu"
      >
        <span className="inline-flex h-5 w-5 rounded-full bg-white/[0.12] items-center justify-center text-white font-semibold text-[9px]">
          {initial}
        </span>
        <span className="font-medium max-w-[160px] truncate">{display}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[#8e8e93]" />
      </button>
    ) : variant === "certificate" ? (
      <button
        type="button"
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-[#d1d1d6] bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] transition-colors"
        data-testid="user-account-menu-trigger"
      >
        <span className="h-5 w-5 rounded-full bg-white/[0.12] text-[10px] font-semibold flex items-center justify-center">
          {initial}
        </span>
        <span className="font-medium max-w-[140px] truncate">{display}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[#8e8e93]" />
      </button>
    ) : (
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/[0.03] border border-white/[0.05]",
          "hover:bg-white/[0.06] smooth press-sm text-[#d1d1d6]",
        )}
        data-testid="user-chip"
      >
        <span className="h-6 w-6 rounded-full bg-white/[0.10] text-white text-[11px] font-semibold flex items-center justify-center">
          {initial}
        </span>
        <span className="text-[12px] font-medium pr-0.5 max-w-[120px] truncate">{display}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[#8e8e93] shrink-0" />
      </button>
    );

  return (
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
        >
          Workspace
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
  );
}
