/**
 * Settings — one place, sidebar on the left, a single pane on the right.
 *
 * Account settings used to be three unrelated routes (/company-profile, an
 * onboarding wizard in edit mode, /workspace) that shared no chrome and no
 * mental model. Billing had nowhere to live at all, because there was no
 * billing: the product charged per upload at the moment of upload.
 *
 * Both of those changed at once, so this replaces them with the shape people
 * already know from developer tools — a narrow nav of sections, a wide pane,
 * and rows that put the label and the explanation on the left with the control
 * on the right. Nothing here is clever; it is meant to be boring and findable.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Building2,
  Check,
  Coins,
  CreditCard,
  Loader2,
  Mail,
  Receipt,
  ShieldCheck,
  User as UserIcon,
  Users,
} from "lucide-react";
import { useAuth } from "@toolkit/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { AppNavBack } from "@/components/AppNavBack";
import { companyProfilePath } from "@/components/UserAccountMenu";
import { formatTokens, useTokenBalance } from "@/components/TokenBalancePill";
import type { TokenPack } from "../../shared/tokenPacks";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type TabId = "account" | "billing" | "team" | "company";

const TABS: Array<{ id: TabId; label: string; icon: typeof UserIcon; blurb: string }> = [
  { id: "account", label: "Account", icon: UserIcon, blurb: "Your name, email and sign-in" },
  { id: "billing", label: "Billing & tokens", icon: CreditCard, blurb: "Balance, plan and history" },
  { id: "team", label: "Team", icon: Users, blurb: "Who can see your scorecards" },
  { id: "company", label: "Company", icon: Building2, blurb: "The measured entity's profile" },
];

function isTab(value: string | undefined): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

/** Label + explanation on the left, control on the right. Every row, every tab. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-[#e5e5ea]">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] leading-5 text-[#8e8e93]">{hint}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#0e0e10]">
      <header className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-[12.5px] leading-5 text-[#8e8e93]">{description}</p>}
      </header>
      {children}
    </section>
  );
}

const money = (cents: number) => `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Settings() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/settings/:tab");
  const requested = params?.tab;
  const tab: TabId = isTab(requested) ? requested : "account";

  // A URL like /settings/nonsense should land somewhere real rather than on a
  // blank pane the user has to guess their way out of.
  useEffect(() => {
    if (requested && !isTab(requested)) navigate("/settings/account", { replace: true });
  }, [requested, navigate]);

  return (
    <div className="min-h-screen bg-[#08080a] text-white">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#08080a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3 px-6 py-3">
          <AppNavBack href="/hub" eyebrow="Suite" label="Hub" size="compact" />
          <h1 className="ml-1 text-[15px] font-semibold text-[#e5e5ea]">Settings</h1>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1080px] flex-col gap-8 px-6 py-8 lg:flex-row">
        <nav className="lg:w-[212px] lg:shrink-0" aria-label="Settings sections">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = id === tab;
              return (
                <li key={id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/settings/${id}`)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] transition-colors",
                      active
                        ? "bg-white/[0.08] font-medium text-white"
                        : "text-[#a1a1a6] hover:bg-white/[0.04] hover:text-[#e5e5ea]",
                    )}
                    data-testid={`settings-tab-${id}`}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-80" />
                    <span className="truncate">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 space-y-5">
          {tab === "account" && <AccountTab />}
          {tab === "billing" && <BillingTab />}
          {tab === "team" && <TeamTab />}
          {tab === "company" && <CompanyTab />}
        </main>
      </div>
    </div>
  );
}

function AccountTab() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const display = user?.fullName || user?.username || "Account";
  const initial = display.charAt(0).toUpperCase();

  return (
    <>
      <Panel title="Profile" description="How you appear to the rest of your team.">
        <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.10] text-[16px] font-semibold text-white">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-white">{display}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-[#8e8e93]">
              <Mail className="h-3.5 w-3.5" />
              {user?.email || "No email on file"}
            </p>
          </div>
        </div>
        <Row label="Username" hint="Used to sign in.">
          <span className="font-mono text-[13px] text-[#d1d1d6]">{user?.username ?? "—"}</span>
        </Row>
        <Row label="Role" hint="What you are allowed to do in this workspace.">
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] capitalize text-[#d1d1d6]">
            {String(user?.role ?? "user").replace(/_/g, " ")}
          </span>
        </Row>
      </Panel>

      <Panel title="Session" description="Signing out ends this session on this device only.">
        <Row label="Sign out" hint="You will need your password to come back in.">
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate("/auth", { replace: true });
            }}
            className="rounded-xl border border-white/[0.10] px-4 py-2 text-[13px] font-medium text-[#d1d1d6] transition-colors hover:bg-white/[0.05]"
            data-testid="settings-sign-out"
          >
            Sign out
          </button>
        </Row>
      </Panel>
    </>
  );
}

interface LedgerEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  kind: string;
  description: string;
  createdAt: string;
}

function BillingTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: balanceData, isLoading } = useTokenBalance();
  const [buying, setBuying] = useState<string | null>(null);

  const { data: ledgerData } = useQuery<{ entries: LedgerEntry[] }>({
    queryKey: ["/api/tokens/ledger"],
    staleTime: 30_000,
    retry: false,
  });
  const { data: packData } = useQuery<{ packs: TokenPack[] }>({
    queryKey: ["/api/tokens/packs"],
    retry: false,
  });

  const wallet = balanceData?.wallet ?? null;
  const packs = packData?.packs ?? [];
  const entries = ledgerData?.entries ?? [];

  /**
   * Roughly how many documents the balance is still worth. It is an estimate
   * and says so — a scanned 40-page annual report and a one-page affidavit are
   * not the same spend — but "8,400 tokens" means nothing on its own, and a
   * number nobody can interpret is the same as no number.
   */
  const documentsLeft = useMemo(() => {
    if (!wallet) return null;
    const TYPICAL_DOCUMENT_TOKENS = 120;
    return Math.floor(wallet.balance / TYPICAL_DOCUMENT_TOKENS);
  }, [wallet]);

  const buy = async (packId: string) => {
    setBuying(packId);
    try {
      const res = await apiRequest("POST", "/api/tokens/checkout", { packId });
      const body = await res.json();
      if (body?.simulated) {
        // Development only — settle straight away so the flow is walkable
        // without live PayFast keys. This route 404s in production.
        await apiRequest("POST", `/api/tokens/orders/${body.orderId}/simulate-payment`);
        await queryClient.invalidateQueries({ queryKey: ["/api/tokens/balance"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/tokens/ledger"] });
        toast({ title: "Tokens added", description: "Simulated payment settled (development only)." });
        return;
      }
      if (body?.redirectUrl) {
        window.location.href = body.redirectUrl;
        return;
      }
      throw new Error("The payment provider did not return a checkout link.");
    } catch (err) {
      toast({
        title: "Could not start the payment",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBuying(null);
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#0e0e10]">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-[#636366]">Token balance</p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="text-[42px] font-semibold leading-none tabular-nums text-white">
                {isLoading ? "—" : formatTokens(wallet?.balance ?? 0)}
              </span>
              <span className="text-[14px] text-[#8e8e93]">tokens</span>
            </p>
            <p className="mt-2 text-[12.5px] leading-5 text-[#8e8e93]">
              {documentsLeft !== null
                ? `Roughly ${formatTokens(documentsLeft)} more documents, depending on length and whether they are scans.`
                : "Your organisation's shared balance."}
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#141416] px-4 py-3">
            <p className="text-[11px] text-[#636366]">Plan</p>
            <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold text-white">
              {wallet?.plan === "pro" ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : null}
              {wallet?.plan === "pro" ? "Pro" : "Free"}
            </p>
            {wallet?.planRenewsAt && (
              <p className="mt-1 text-[11px] text-[#8e8e93]">
                Renews {new Date(wallet.planRenewsAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            )}
          </div>
        </div>
      </section>

      <Panel
        title="Buy tokens"
        description="Tokens are shared across your whole organisation and never expire. Documents are charged by what it actually takes to read them — a one-page affidavit costs a fraction of a scanned annual report."
      >
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {packs.map((pack) => (
            <div
              key={pack.id}
              className={cn(
                "flex flex-col rounded-2xl border p-4",
                pack.highlight ? "border-white/[0.18] bg-white/[0.05]" : "border-white/[0.07] bg-[#141416]",
              )}
              data-testid={`token-pack-${pack.id}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[14px] font-semibold text-white">{pack.name}</p>
                {pack.highlight && (
                  <span className="rounded-full bg-white/[0.10] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#d1d1d6]">
                    Popular
                  </span>
                )}
              </div>
              <p className="mt-1 text-[22px] font-semibold text-white">
                {money(pack.amountCents)}
                {pack.grantsPro && <span className="text-[12px] font-normal text-[#8e8e93]">/month</span>}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[#8e8e93]">{pack.blurb}</p>
              <ul className="mt-3 space-y-1.5">
                {pack.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[12px] leading-5 text-[#a1a1a6]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8e8e93]" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void buy(pack.id)}
                disabled={buying !== null}
                className={cn(
                  "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50",
                  pack.highlight
                    ? "bg-white text-[#0e0e10] hover:bg-[#f2f2f7]"
                    : "border border-white/[0.12] text-[#e5e5ea] hover:bg-white/[0.06]",
                )}
                data-testid={`buy-${pack.id}`}
              >
                {buying === pack.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                {pack.grantsPro ? "Upgrade to Pro" : `Add ${formatTokens(pack.tokens)}`}
              </button>
            </div>
          ))}
          {packs.length === 0 && (
            <p className="text-[12.5px] text-[#8e8e93]">Token packs are unavailable right now.</p>
          )}
        </div>
      </Panel>

      <Panel title="Usage history" description="Every token in and out, newest first.">
        {entries.length === 0 ? (
          <p className="px-5 py-6 text-[12.5px] text-[#8e8e93]">
            Nothing yet. Movements appear here as soon as you process documents or buy tokens.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-[#e5e5ea]">{entry.description || entry.kind}</p>
                  <p className="mt-0.5 text-[11.5px] text-[#636366]">
                    {new Date(entry.createdAt).toLocaleString("en-ZA", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {formatTokens(entry.balanceAfter)} left
                  </p>
                </div>
                {/* Sign is spelled out, not just coloured. */}
                <span
                  className={cn(
                    "shrink-0 font-mono text-[13px] tabular-nums",
                    entry.delta < 0 ? "text-[#d1d1d6]" : "text-emerald-300",
                  )}
                >
                  {entry.delta < 0 ? "−" : "+"}
                  {formatTokens(Math.abs(entry.delta))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="flex items-start gap-2 px-1 text-[11.5px] leading-5 text-[#636366]">
        <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Payments are processed by PayFast. Okiru never sees or stores your card details.
      </p>
    </>
  );
}

interface Member {
  id: string;
  fullName: string | null;
  username: string | null;
  email: string | null;
  role: string;
  isAdmin: boolean;
}

function TeamTab() {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<{ members: Member[]; isAdmin: boolean }>({
    queryKey: ["/api/organization/members"],
    retry: false,
  });
  const members = data?.members ?? [];

  return (
    <>
      <Panel
        title="Members"
        description="Everyone here shares one token balance and can see the organisation's scorecards."
      >
        {isLoading ? (
          <p className="px-5 py-6 text-[12.5px] text-[#8e8e93]">Loading your team…</p>
        ) : members.length === 0 ? (
          <p className="px-5 py-6 text-[12.5px] text-[#8e8e93]">You are the only member so far.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-semibold text-white">
                  {(member.fullName || member.username || "?").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] text-[#e5e5ea]">{member.fullName || member.username}</p>
                  <p className="truncate text-[11.5px] text-[#8e8e93]">{member.email || "No email on file"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] capitalize text-[#a1a1a6]">
                  {member.isAdmin ? "Admin" : String(member.role ?? "user").replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Row label="Invites and permissions" hint="Add colleagues, transfer admin, remove access.">
          <button
            type="button"
            onClick={() => navigate("/workspace")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] px-4 py-2 text-[13px] font-medium text-[#d1d1d6] transition-colors hover:bg-white/[0.05]"
          >
            Open workspace
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </Row>
      </Panel>
    </>
  );
}

function CompanyTab() {
  const [, navigate] = useLocation();
  const { data } = useQuery<{ organization: { name: string } | null; memberCount: number }>({
    queryKey: ["/api/organization"],
    retry: false,
  });

  return (
    <Panel
      title="Measured entity"
      description="The company your scorecards are built for. Sector and size decide which codes apply, so these are worth getting right."
    >
      <Row label="Organisation" hint="Shown on scorecards and shared with your team.">
        <span className="text-[13px] text-[#d1d1d6]">{data?.organization?.name ?? "—"}</span>
      </Row>
      <Row label="Company & B-BBEE profile" hint="Sector, size, financial year, ownership basics.">
        <button
          type="button"
          onClick={() => navigate(companyProfilePath("/settings/company"))}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] px-4 py-2 text-[13px] font-medium text-[#d1d1d6] transition-colors hover:bg-white/[0.05]"
          data-testid="settings-edit-company"
        >
          Edit profile
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </Row>
    </Panel>
  );
}
