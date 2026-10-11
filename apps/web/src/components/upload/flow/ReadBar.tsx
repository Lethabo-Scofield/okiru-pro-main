/**
 * The read bar: one sentence and one button that move a staged pack on.
 *
 *   "9 documents ready to read · 1,240 tokens (you have 3,000)"   Cost details   [Read 9 documents]
 *
 * It is the only money gate. "Cost details" opens the price per document
 * underneath (the old full-screen checkout, folded into the bar), and while
 * that is open the read button moves down to the foot of the table so the
 * screen still has exactly one filled button.
 *
 * When pricing fails the bar itself turns amber and says so where the button
 * was — Try again — instead of leaving a dead end.
 */
import type { ReactNode } from "react";
import { ArrowRight, CreditCard, Loader2 } from "lucide-react";
import { outlineButton, primaryButton, productOf, textButton } from "./buttonStyles";
import { documentsText, tokenText, type TokenCost } from "./tokenCost";

export type ReadBarState = "pricing" | "priced" | "failed";

export interface ReadBarProps {
  testIdPrefix: "" | "esg-";
  /** Documents that will be read (the unread ones). */
  count: number;
  /** A round after the first read: say "new", and that read ones are not charged again. */
  newRound: boolean;
  state: ReadBarState;
  /** The server will take tokens, and the price is known. */
  charging: boolean;
  /** The server said this run is free. */
  free: boolean;
  tokenCost: TokenCost | null;
  /** Why pricing failed, when the server said. */
  failureDetail?: string | null;
  costOpen: boolean;
  onToggleCost: () => void;
  onRetry: () => void;
  onRead: () => void;
  /** A read or a payment is in flight. */
  busy: boolean;
  /** The Cost details panel, shown when open and priced. */
  children?: ReactNode;
}

export function ReadBar({
  testIdPrefix: p,
  count,
  newRound,
  state,
  charging,
  free,
  tokenCost,
  failureDetail,
  costOpen,
  onToggleCost,
  onRetry,
  onRead,
  busy,
  children,
}: ReadBarProps) {
  const product = productOf(p);
  const unaffordable = charging && tokenCost !== null && !tokenCost.sufficient && !tokenCost.alreadyAuthorized;
  const docs = documentsText(count, newRound ? "new" : "");
  const price =
    state === "pricing"
      ? "working out the cost…"
      : state === "failed"
        ? "we couldn't work out the cost. Nothing was read or charged."
        : charging && tokenCost
          ? `${tokenText(tokenCost.tokens)} tokens (you have ${tokenText(tokenCost.balance)})`
          : free
            ? "free to read"
            : "checking your balance…";

  return (
    <div
      className={`mt-3 rounded-[18px] border px-4 py-3 transition-colors duration-200 ${
        state === "failed" ? "border-amber-400/30 bg-amber-500/[0.06]" : "border-white/[0.08] bg-[color:var(--ink-3)]"
      }`}
      data-testid={`${p}read-bar`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] leading-5 text-[color:var(--body)]">
            <span className="font-semibold text-white">{docs} ready to read</span>
            {" · "}
            <span className={state === "failed" ? "text-amber-100" : ""} data-testid={`${p}read-bar-price`}>{price}</span>
          </p>
          {state === "failed" && failureDetail && !costOpen && (
            <p className="mt-0.5 text-[12px] leading-5 text-[color:var(--body)]" data-testid={`${p}read-bar-failure`}>
              {failureDetail}
            </p>
          )}
          {newRound && (
            <p className="mt-0.5 text-[12px] leading-5 text-[color:var(--muted)]">Documents already read are not charged again.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={state === "pricing"}
            onClick={onToggleCost}
            aria-expanded={costOpen}
            aria-controls={`${p}cost-details`}
            className={textButton()}
            data-testid={`${p}button-done-staging`}
          >
            Cost details
          </button>
          {!costOpen &&
            (state === "failed" ? (
              <button type="button" onClick={onRetry} className={primaryButton(product)} data-testid={`${p}button-retry-quote-inline`}>
                Try again
              </button>
            ) : unaffordable && tokenCost ? (
              <a href="/settings/billing" className={primaryButton(product)} data-testid={`${p}button-add-tokens`}>
                <CreditCard className="h-4 w-4" aria-hidden />
                Add tokens — {tokenText(tokenCost.shortfall)} short
              </a>
            ) : (
              <button
                type="button"
                disabled={state !== "priced" || busy}
                onClick={onRead}
                className={primaryButton(product)}
                data-testid={`${p}button-read-now`}
              >
                {state === "pricing" || busy ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <ArrowRight className="h-4 w-4" aria-hidden />
                )}
                Read {documentsText(count)}
              </button>
            ))}
        </div>
      </div>

      {costOpen && state === "failed" && (
        <div
          className="mt-3 flex flex-col gap-3 border-t border-amber-400/20 pt-3 sm:flex-row sm:items-center sm:justify-between"
          id={`${p}cost-details`}
          data-testid={`${p}quote-unavailable`}
          role="alert"
        >
          <p className="min-w-0 text-[12px] leading-5 text-[color:var(--body)]">
            We couldn&apos;t work out the cost of {count === 1 ? "this document" : `these ${count} documents`}.
            {failureDetail ? ` ${failureDetail}.`.replace(/\.\.$/, ".") : ""} Nothing has been read and nothing has been charged.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onToggleCost} className={outlineButton()} data-testid={`${p}button-back-to-staging`}>
              Back to adding
            </button>
            <button type="button" onClick={onRetry} className={primaryButton(product)} data-testid={`${p}button-retry-quote`}>
              Try again
            </button>
          </div>
        </div>
      )}
      {costOpen && state === "priced" && children}
    </div>
  );
}

export default ReadBar;
