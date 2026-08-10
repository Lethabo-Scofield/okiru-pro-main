/**
 * PayFast checkout for token purchases.
 *
 * Deliberately a sibling of okiru-ai-parser/src/services/payfastPayment.ts
 * rather than an import of it: that module signs *parser quotes* and lives in a
 * separate deployable service. What is bought here is a token pack, the order
 * record lives in the web app's Mongo, and the ITN must land on the web app to
 * credit it. Sharing one module across two services would mean sharing the
 * notify URL, which is exactly the thing that must differ.
 *
 * The signing rules below are PayFast's and are identical in both — if you fix
 * a signing bug here, fix it there too.
 *
 * Non-negotiables carried over:
 *   - card data is never rendered, received, stored or logged; PayFast's page owns it
 *   - a purchase is credited only by a verified ITN, never on the browser's word
 *   - unconfigured merchant credentials fail CLOSED
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createLogger } from "./logger";

const logger = createLogger("PayfastTokens");

const PROCESS_URL =
  process.env.PAYFAST_PROCESS_URL ||
  (process.env.PAYFAST_SANDBOX === "true"
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process");
const VALIDATE_URL =
  process.env.PAYFAST_VALIDATE_URL ||
  (process.env.PAYFAST_SANDBOX === "true"
    ? "https://sandbox.payfast.co.za/eng/query/validate"
    : "https://www.payfast.co.za/eng/query/validate");

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "";
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "";
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || "https://okiru.pro").replace(/\/+$/, "");
const NOTIFY_URL = process.env.PAYFAST_TOKENS_NOTIFY_URL || `${PUBLIC_BASE_URL}/api/tokens/webhooks/payfast`;

export function payfastConfigured(): boolean {
  return MERCHANT_ID.length > 0 && MERCHANT_KEY.length > 0;
}

/**
 * Local-only escape hatch so the buy-tokens flow can be walked without live
 * PayFast credentials. Hard-gated: can NEVER be true in production.
 */
export function simulatedPurchaseAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.TOKENS_ALLOW_SIMULATED_PURCHASE === "true";
}

/** PayFast's encoding: spaces as '+', uppercase percent-encoding. */
function payfastEncode(value: string): string {
  return encodeURIComponent(value.trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function signParams(params: Array<[string, string]>): string {
  const base = params
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${k}=${payfastEncode(v)}`)
    .join("&");
  const withPass = PASSPHRASE ? `${base}&passphrase=${payfastEncode(PASSPHRASE)}` : base;
  return createHash("md5").update(withPass).digest("hex");
}

export interface TokenCheckout {
  redirectUrl: string;
  simulated: boolean;
}

export function createTokenCheckout(params: {
  orderId: string;
  packName: string;
  amountCents: number;
}): TokenCheckout {
  const cents = Math.round(params.amountCents);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("Checkout amount must be a positive number of cents");
  }

  if (!payfastConfigured()) {
    if (simulatedPurchaseAllowed()) {
      logger.warn("PayFast is not configured — issuing a SIMULATED token checkout (development only)", {
        orderId: params.orderId,
      });
      return {
        redirectUrl: `${PUBLIC_BASE_URL}/settings/billing?order=${encodeURIComponent(params.orderId)}&simulated=1`,
        simulated: true,
      };
    }
    throw new Error("Payments are not configured (PAYFAST_MERCHANT_ID / PAYFAST_MERCHANT_KEY missing)");
  }

  const amount = (cents / 100).toFixed(2);
  // Order matters — the signature is computed over exactly this sequence.
  const fields: Array<[string, string]> = [
    ["merchant_id", MERCHANT_ID],
    ["merchant_key", MERCHANT_KEY],
    ["return_url", `${PUBLIC_BASE_URL}/settings/billing?order=${encodeURIComponent(params.orderId)}&status=success`],
    ["cancel_url", `${PUBLIC_BASE_URL}/settings/billing?order=${encodeURIComponent(params.orderId)}&status=cancelled`],
    ["notify_url", NOTIFY_URL],
    ["m_payment_id", params.orderId],
    ["amount", amount],
    ["item_name", `Okiru ${params.packName}`],
    ["custom_str1", params.orderId],
  ];
  const signature = signParams(fields);
  const query = [...fields, ["signature", signature]]
    .map(([k, v]) => `${k}=${payfastEncode(v)}`)
    .join("&");

  return { redirectUrl: `${PROCESS_URL}?${query}`, simulated: false };
}

/**
 * Verify an ITN two ways — recompute the signature over the posted fields, AND
 * post the data back to PayFast and require a VALID reply. Either alone is
 * insufficient; both together is the canonical check.
 */
export async function verifyTokenItn(postedFields: Record<string, string>): Promise<boolean> {
  if (!payfastConfigured()) {
    logger.error("PayFast not configured — refusing to trust ITN", new Error("missing merchant config"));
    return false;
  }

  const claimed = postedFields.signature ?? "";
  const forSigning: Array<[string, string]> = Object.entries(postedFields).filter(([k]) => k !== "signature");
  const expected = signParams(forSigning);
  const a = Buffer.from(claimed);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    logger.warn("PayFast token ITN signature mismatch");
    return false;
  }

  try {
    const body = Object.entries(postedFields)
      .map(([k, v]) => `${k}=${payfastEncode(v)}`)
      .join("&");
    const res = await fetch(VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = (await res.text()).trim();
    if (!/^VALID/i.test(text)) {
      logger.warn("PayFast server-side validation did not return VALID", { reply: text.slice(0, 40) });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("PayFast token ITN validation call failed", err as Error);
    return false;
  }
}

export function isPaymentComplete(fields: Record<string, string>): boolean {
  return String(fields.payment_status ?? "").toUpperCase() === "COMPLETE";
}
