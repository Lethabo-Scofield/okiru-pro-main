/**
 * The token balance, in every header.
 *
 * Credit only works as a model if the balance is ambient. If someone has to go
 * looking for it, they discover it at the worst possible moment — mid-upload,
 * out of tokens, with a client waiting. So it rides next to the account chip on
 * every page, and it is a link: seeing "low" and being one click from fixing it
 * is the whole point.
 *
 * State is never carried by colour alone (dataviz rule): low and empty balances
 * change the icon and add a word, so the warning survives a monochrome screen.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Coins, Loader2, Receipt, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TokenPack } from "../../shared/tokenPacks";

/**
 * Anything that spends or buys tokens fires this, and every mounted pill
 * refetches. A window event rather than shared state because the pill is
 * rendered inside nine unrelated page headers with no common ancestor to hold
 * a store — and a stale balance immediately after a spend is exactly the number
 * a user will not trust again.
 */
export const TOKENS_CHANGED_EVENT = "okiru:tokens-changed";

export interface TokenWallet {
  organizationId: string;
  balance: number;
  plan: "free" | "pro";
  planRenewsAt: string | null;
}

interface BalanceResponse {
  wallet: TokenWallet | null;
  freeGrant: number;
  tokensPerCent: number;
}

/** Below this, the pill starts saying so rather than just showing a number. */
const LOW_BALANCE = 1_000;

export function useTokenBalance() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/tokens/balance"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/tokens/ledger"] });
    };
    window.addEventListener(TOKENS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(TOKENS_CHANGED_EVENT, refresh);
  }, [queryClient]);

  return useQuery<BalanceResponse>({
    queryKey: ["/api/tokens/balance"],
    // The balance moves when work is done elsewhere in the app, so unlike the
    // app-wide default (staleTime: Infinity) this one is allowed to go stale.
    staleTime: 30_000,
    retry: false,
  });
}

export function formatTokens(value: number): string {
  return value.toLocaleString("en-ZA");
}

interface LedgerEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  kind: string;
  description: string;
  createdAt: string;
}

const money = (cents: number) =>
  `R${(cents / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function TokenBalancePill({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useTokenBalance();

  // A user with no organisation has no wallet, and a failed read should not
  // plant a scary zero in the header. In both cases, show nothing.
  if (isLoading || isError || !data?.wallet) return null;

  const { balance, plan } = data.wallet;
  const empty = balance <= 0;
  const low = !empty && balance < LOW_BALANCE;

  return (
    <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={`${formatTokens(balance)} tokens remaining · ${plan === "pro" ? "Pro plan" : "Free plan"}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
        empty
          ? "border-red-400/30 bg-red-500/[0.08] text-red-200 hover:bg-red-500/[0.14]"
          : low
            ? "border-amber-400/30 bg-amber-500/[0.08] text-amber-100 hover:bg-amber-500/[0.14]"
            : "border-amber-300/45 bg-amber-100/35 text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-xl hover:bg-amber-100/50",
        className,
      )}
      data-testid="token-balance-pill"
    >
      {empty || low ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Coins className="h-3.5 w-3.5 shrink-0 text-amber-500 drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]" aria-hidden />
      )}
      <span className="tabular-nums">{formatTokens(balance)}</span>
      {/* Never colour alone: the state is spelled out. */}
      <span className="text-[11px] opacity-70">{empty ? "empty" : low ? "low" : "tokens"}</span>
    </button>
    <TokenBillingDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function TokenBillingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: balanceData, isLoading } = useTokenBalance();
  const [buying, setBuying] = useState<string | null>(null);

  const { data: ledgerData } = useQuery<{ entries: LedgerEntry[] }>({
    queryKey: ["/api/tokens/ledger"],
    staleTime: 30_000,
    retry: false,
    enabled: open,
  });
  const { data: packData } = useQuery<{ packs: TokenPack[] }>({
    queryKey: ["/api/tokens/packs"],
    retry: false,
    enabled: open,
  });

  const wallet = balanceData?.wallet ?? null;
  const packs = packData?.packs ?? [];
  const entries = ledgerData?.entries ?? [];
  const documentsLeft = useMemo(() => {
    if (!wallet) return null;
    return Math.floor(wallet.balance / 120);
  }, [wallet]);

  const buy = async (packId: string) => {
    setBuying(packId);
    try {
      const res = await apiRequest("POST", "/api/tokens/checkout", { packId });
      const body = await res.json();
      if (body?.simulated) {
        await apiRequest("POST", `/api/tokens/orders/${body.orderId}/simulate-payment`);
        await queryClient.invalidateQueries({ queryKey: ["/api/tokens/balance"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/tokens/ledger"] });
        toast({ title: "Tokens added", description: "Simulated payment settled." });
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/35 p-4 text-left backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-billing-title"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="max-h-[86vh] w-full max-w-[920px] overflow-hidden rounded-[18px] border border-white/70 bg-white/82 text-zinc-900 shadow-[0_30px_100px_-55px_rgba(24,24,27,0.85)] backdrop-blur-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-200/70 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Billing</p>
            <h2 id="token-billing-title" className="mt-1 text-[18px] font-semibold text-zinc-950">
              Tokens
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="grid h-8 w-8 place-items-center rounded-full border border-zinc-200 bg-white/70 text-zinc-500 transition hover:bg-white hover:text-zinc-950"
            aria-label="Close token billing"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[calc(86vh-73px)] overflow-y-auto p-5">
          <section className="rounded-[14px] border border-zinc-200/80 bg-white/72 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Token balance</p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-[40px] font-semibold leading-none tabular-nums text-zinc-950">
                    {isLoading ? "-" : formatTokens(wallet?.balance ?? 0)}
                  </span>
                  <span className="text-[14px] text-zinc-500">tokens</span>
                </p>
                <p className="mt-2 text-[12.5px] leading-5 text-zinc-600">
                  {documentsLeft !== null
                    ? `Roughly ${formatTokens(documentsLeft)} more documents, depending on length and scans.`
                    : "Your organisation's shared balance."}
                </p>
              </div>
              <div className="rounded-[12px] border border-zinc-200 bg-white/75 px-4 py-3">
                <p className="text-[11px] text-zinc-500">Plan</p>
                <p className="mt-1 text-[14px] font-semibold capitalize text-zinc-950">{wallet?.plan ?? "free"}</p>
              </div>
            </div>
          </section>

          <section className="mt-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-semibold text-zinc-950">Buy tokens</h3>
                <p className="mt-0.5 text-[12px] text-zinc-600">Shared across the organisation and never expire.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  className={cn(
                    "flex flex-col rounded-[14px] border p-4",
                    pack.highlight ? "border-zinc-300 bg-white" : "border-zinc-200/80 bg-white/62",
                  )}
                  data-testid={`token-pack-${pack.id}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[14px] font-semibold text-zinc-950">{pack.name}</p>
                    {pack.highlight && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[22px] font-semibold text-zinc-950">
                    {money(pack.amountCents)}
                    {pack.grantsPro && <span className="text-[12px] font-normal text-zinc-500">/month</span>}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-zinc-600">{pack.blurb}</p>
                  <ul className="mt-3 space-y-1.5">
                    {pack.features.slice(0, 3).map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-[12px] leading-5 text-zinc-600">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => void buy(pack.id)}
                    disabled={buying !== null}
                    className={cn(
                      "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-50",
                      pack.highlight
                        ? "bg-zinc-950 text-white hover:bg-black"
                        : "border border-zinc-200 bg-white/70 text-zinc-900 hover:bg-white",
                    )}
                    data-testid={`buy-${pack.id}`}
                  >
                    {buying === pack.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                    {pack.grantsPro ? "Upgrade to Pro" : `Add ${formatTokens(pack.tokens)}`}
                  </button>
                </div>
              ))}
              {packs.length === 0 && (
                <p className="text-[12.5px] text-zinc-600">Token packs are unavailable right now.</p>
              )}
            </div>
          </section>

          <section className="mt-4 rounded-[14px] border border-zinc-200/80 bg-white/62">
            <header className="border-b border-zinc-200/70 px-4 py-3">
              <h3 className="text-[14px] font-semibold text-zinc-950">Usage history</h3>
            </header>
            {entries.length === 0 ? (
              <p className="px-4 py-5 text-[12.5px] text-zinc-600">No token movements yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-200/70">
                {entries.slice(0, 6).map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-zinc-900">{entry.description || entry.kind}</p>
                      <p className="mt-0.5 text-[11.5px] text-zinc-500">
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
                    <span className={cn("shrink-0 font-mono text-[13px]", entry.delta < 0 ? "text-zinc-500" : "text-emerald-600")}>
                      {entry.delta < 0 ? "-" : "+"}
                      {formatTokens(Math.abs(entry.delta))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-3 flex items-start gap-2 px-1 text-[11.5px] leading-5 text-zinc-500">
            <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Payments are processed by PayFast. Okiru never sees or stores your card details.
          </p>
        </div>
      </div>
    </div>
  );
}

export default TokenBalancePill;
