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
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function TokenBalancePill({ className }: { className?: string }) {
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useTokenBalance();

  // A user with no organisation has no wallet, and a failed read should not
  // plant a scary zero in the header. In both cases, show nothing.
  if (isLoading || isError || !data?.wallet) return null;

  const { balance, plan } = data.wallet;
  const empty = balance <= 0;
  const low = !empty && balance < LOW_BALANCE;

  return (
    <button
      type="button"
      onClick={() => navigate("/settings/billing")}
      title={`${formatTokens(balance)} tokens remaining · ${plan === "pro" ? "Pro plan" : "Free plan"}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
        empty
          ? "border-red-400/30 bg-red-500/[0.08] text-red-200 hover:bg-red-500/[0.14]"
          : low
            ? "border-amber-400/30 bg-amber-500/[0.08] text-amber-100 hover:bg-amber-500/[0.14]"
            : "border-white/[0.08] bg-white/[0.04] text-[#d1d1d6] hover:bg-white/[0.08]",
        className,
      )}
      data-testid="token-balance-pill"
    >
      {empty || low ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Coins className="h-3.5 w-3.5 shrink-0 text-[#8e8e93]" aria-hidden />
      )}
      <span className="tabular-nums">{formatTokens(balance)}</span>
      {/* Never colour alone: the state is spelled out. */}
      <span className="text-[11px] opacity-70">{empty ? "empty" : low ? "low" : "tokens"}</span>
    </button>
  );
}

export default TokenBalancePill;
