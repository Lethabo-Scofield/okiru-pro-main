/**
 * Cost details — opened from the read bar, never a separate screen.
 *
 * There used to be a full-screen checkout here: a 30px total, a "balance
 * after" box, three stat tiles ("Pages: Auto"), a price table, the pricing
 * rules, an "Included" box, a back link and a second read button — the token
 * total three times over. The read bar already carries the price and the one
 * read button, so this only answers "why that much?": the price per document
 * and the total, with the rules behind one more "details".
 *
 * While it is open the read button lives here, at the foot of the table (the
 * bar hides its own), so there is still exactly one filled button on screen.
 */
import { AlertTriangle, ArrowRight, CreditCard, Loader2 } from "lucide-react";
import { Disclosure } from "./Disclosure";
import { primaryButton, outlineButton, productOf } from "./buttonStyles";
import { PRICE_LABELS, documentsText, fileUnits, tokenText, type QuotedFile, type TokenCost } from "./tokenCost";

export interface CostDetailsProps {
  testIdPrefix: "" | "esg-";
  files: QuotedFile[];
  tokenCost: TokenCost | null;
  /** The server will take tokens for this read. */
  charging: boolean;
  /** Scans are priced at the top of their range. */
  isUpperBound?: boolean;
  /** When the free quote lapses, as an ISO string. */
  expiresAt?: string;
  onRead: () => void;
  /** A read or a payment is in flight. */
  busy: boolean;
}

export function CostDetails({
  testIdPrefix: p,
  files,
  tokenCost,
  charging,
  isUpperBound = false,
  expiresAt,
  onRead,
  busy,
}: CostDetailsProps) {
  const product = productOf(p);
  const cannotAfford = charging && tokenCost !== null && !tokenCost.sufficient && !tokenCost.alreadyAuthorized;
  const expiry = expiresAt ? new Date(expiresAt) : null;
  const expiryLabel =
    expiry && !Number.isNaN(expiry.getTime())
      ? expiry.toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : null;
  const hasRules = charging && (tokenCost?.effortRules?.length ?? 0) > 0;
  const minimum = charging ? tokenCost?.minimumTopUp ?? 0 : 0;

  return (
    <div className="mt-3 border-t border-white/[0.07] pt-3" data-testid={`${p}payment-summary`} id={`${p}cost-details`}>
      <table className="w-full border-collapse text-left text-[12.5px]">
        <caption className="sr-only">Cost per document</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Document</th>
            <th scope="col">{charging ? "Cost" : "Size"}</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const priced = tokenCost?.files?.find((f) => f.filename === file.filename);
            const units = fileUnits(file);
            const notes = [units, file.requiresOcr ? "scanned" : "", priced ? PRICE_LABELS[priced.effort] ?? "" : ""].filter(Boolean);
            return (
              <tr key={file.filename} className="border-b border-white/[0.05] last:border-b-0">
                <td className="min-w-0 py-2 pr-3 align-top">
                  <span className="block truncate text-[color:var(--hi)]" title={file.filename}>{file.filename}</span>
                  {notes.length > 0 && <span className="block text-[11px] text-[color:var(--muted)]">{notes.join(" · ")}</span>}
                </td>
                <td className="whitespace-nowrap py-2 text-right align-top tabular-nums text-[color:var(--body)]">
                  {charging && priced ? `${tokenText(priced.tokens)} tokens` : units || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/[0.12]">
            <th scope="row" className="py-2 pr-3 text-left text-[12.5px] font-semibold text-white">Total</th>
            <td className="py-2 text-right text-[13px] font-semibold tabular-nums text-white" data-testid={`${p}quote-total-cost`}>
              {charging && tokenCost ? `${tokenText(tokenCost.tokens)} tokens` : documentsText(files.length)}
            </td>
          </tr>
        </tfoot>
      </table>

      {!charging && <p className="mt-1 text-[11.5px] text-[color:var(--muted)]">Reading is free for this run.</p>}

      {cannotAfford && tokenCost && (
        <div
          className="mt-3 flex flex-col gap-2 rounded-xl border border-red-400/25 bg-red-500/[0.06] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          data-testid={`${p}insufficient-tokens`}
          role="alert"
        >
          <p className="text-[12.5px] leading-5 text-[color:var(--body)]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-red-200">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {tokenText(tokenCost.shortfall)} tokens short.
            </span>{" "}
            These documents need {tokenText(tokenCost.tokens)} tokens and you have {tokenText(tokenCost.balance)}. Add
            tokens, or remove some documents and read the rest first.
          </p>
          <a href="/settings/billing" className={primaryButton(product)}>
            <CreditCard className="h-4 w-4" aria-hidden />
            Add tokens
          </a>
        </div>
      )}

      {(hasRules || minimum > 0 || (charging && tokenCost) || isUpperBound || (!charging && expiryLabel)) && (
        <Disclosure summary="How the price is worked out" className="mt-3" summaryClassName="text-[12px]">
          <div className="space-y-2 text-[11.5px] leading-5 text-[color:var(--body)]">
            {hasRules && (
              <div data-testid={`${p}effort-rules`}>
                {tokenCost!.effortRules!.map((rule) => (
                  <p key={rule.tier}>
                    <span className="font-semibold text-[color:var(--hi)]">{PRICE_LABELS[rule.tier] ?? rule.label}</span> — {rule.rule}
                  </p>
                ))}
              </div>
            )}
            {minimum > 0 && (
              <p data-testid={`${p}quote-minimum-charge`}>
                <span className="font-semibold text-[color:var(--hi)]">Minimum charge</span> — a small batch is topped up by{" "}
                {tokenText(minimum)} tokens to the minimum charge. It is included in the total.
              </p>
            )}
            {charging && tokenCost && (
              <p className={tokenCost.sufficient ? "" : "text-red-300"} data-testid={`${p}balance-after`}>
                You&apos;ll have {tokenText(Math.max(0, tokenCost.balanceAfter))} tokens left of {tokenText(tokenCost.balance)}.
              </p>
            )}
            {charging && isUpperBound && (
              <p>Scanned documents are estimated at the top of their range. You won&apos;t pay more than this.</p>
            )}
            {!charging && expiryLabel && <p>This price holds until {expiryLabel}.</p>}
          </div>
        </Disclosure>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onRead}
          disabled={busy || cannotAfford}
          className={cannotAfford ? outlineButton() : primaryButton(product)}
          data-testid={charging ? `${p}button-spend-tokens` : `${p}button-process`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
          Read {documentsText(files.length)}
        </button>
      </div>
    </div>
  );
}

export default CostDetails;
