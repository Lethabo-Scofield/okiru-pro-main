/**
 * PayFast payment (flow step 6).
 *
 * PayFast is a redirect-based processor: we build a signed set of parameters,
 * send the user to PayFast's hosted page to pay, and PayFast confirms the
 * outcome back to us via an ITN (Instant Transaction Notification) webhook.
 *
 * As with the card processor before it, this service:
 *   - never renders, receives, stores or logs card data — PayFast's page owns it;
 *   - never marks a quote paid on the browser's word — only a verified ITN does;
 *   - fails CLOSED when unconfigured, so a missing key can't make extraction free.
 *
 * Secrets come from the environment only (PAYFAST_MERCHANT_ID,
 * PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE) and must never be committed.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createLogger } from '../logger.js';

const logger = createLogger('PayfastPayment');

const PAYFAST_PROCESS_URL = process.env.PAYFAST_PROCESS_URL
  || (process.env.PAYFAST_SANDBOX === 'true'
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process');
const PAYFAST_VALIDATE_URL = process.env.PAYFAST_VALIDATE_URL
  || (process.env.PAYFAST_SANDBOX === 'true'
    ? 'https://sandbox.payfast.co.za/eng/query/validate'
    : 'https://www.payfast.co.za/eng/query/validate');

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || '';
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || '';
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || '';
const PUBLIC_BASE_URL = (process.env.PARSER_PUBLIC_BASE_URL || 'https://okiru.pro').replace(/\/+$/, '');
/** Where PayFast POSTs the ITN. Must be publicly reachable in production. */
const NOTIFY_URL = process.env.PAYFAST_NOTIFY_URL || `${PUBLIC_BASE_URL}/api/parser/webhooks/payfast`;

/**
 * Local-only escape hatch so the flow can be walked without live PayFast
 * credentials. Hard-gated: can NEVER be true in production.
 */
export function simulatedPaymentAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.PARSER_ALLOW_SIMULATED_PAYMENT === 'true';
}

export function payfastConfigured(): boolean {
  return MERCHANT_ID.length > 0 && MERCHANT_KEY.length > 0;
}

export interface PayfastCheckout {
  redirectUrl: string;
  simulated: boolean;
}

/**
 * PayFast signs by MD5 of the URL-encoded parameter string, in the order the
 * fields are submitted, with the passphrase appended when one is set. Its
 * encoding is specific: spaces as '+', uppercase percent-encoding.
 */
function payfastEncode(value: string): string {
  return encodeURIComponent(value.trim())
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function signParams(params: Array<[string, string]>): string {
  const base = params
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}=${payfastEncode(v)}`)
    .join('&');
  const withPass = PASSPHRASE ? `${base}&passphrase=${payfastEncode(PASSPHRASE)}` : base;
  return createHash('md5').update(withPass).digest('hex');
}

/**
 * Build a PayFast checkout for a quote. Amount is in cents; PayFast wants rands
 * to two decimals, and rounding here keeps "what we charge" identical to "what
 * we showed".
 */
export function createPayfastCheckout(params: {
  quoteId: string;
  amountCents: number;
  currency: string;
}): PayfastCheckout {
  const cents = Math.round(params.amountCents);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error('Checkout amount must be a positive number of cents');
  }

  if (!payfastConfigured()) {
    if (simulatedPaymentAllowed()) {
      logger.warn('PayFast is not configured — issuing a SIMULATED checkout (local development only)', { quoteId: params.quoteId });
      return {
        redirectUrl: `${PUBLIC_BASE_URL}/create-scorecard/payment/simulated?quote=${encodeURIComponent(params.quoteId)}`,
        simulated: true,
      };
    }
    // Fail closed: no merchant, no payment, no extraction.
    throw new Error('Payments are not configured (PAYFAST_MERCHANT_ID / PAYFAST_MERCHANT_KEY missing)');
  }

  const amount = (cents / 100).toFixed(2);
  // Order matters — the signature is computed over exactly this sequence.
  const fields: Array<[string, string]> = [
    ['merchant_id', MERCHANT_ID],
    ['merchant_key', MERCHANT_KEY],
    ['return_url', `${PUBLIC_BASE_URL}/create-scorecard/payment/success?quote=${encodeURIComponent(params.quoteId)}`],
    ['cancel_url', `${PUBLIC_BASE_URL}/create-scorecard/payment/cancelled?quote=${encodeURIComponent(params.quoteId)}`],
    ['notify_url', NOTIFY_URL],
    ['m_payment_id', params.quoteId],
    ['amount', amount],
    ['item_name', 'Okiru document processing'],
    ['custom_str1', params.quoteId],
  ];
  const signature = signParams(fields);
  const query = [...fields, ['signature', signature]]
    .map(([k, v]) => `${k}=${payfastEncode(v)}`)
    .join('&');

  return { redirectUrl: `${PAYFAST_PROCESS_URL}?${query}`, simulated: false };
}

/**
 * Verify a PayFast ITN. PayFast does not send a header signature — the
 * `signature` field is part of the posted body, and the canonical way to trust
 * an ITN is two-fold: (1) recompute the signature over the posted fields, and
 * (2) post the data back to PayFast and require an 'VALID' reply. We do both.
 */
export async function verifyPayfastItn(postedFields: Record<string, string>): Promise<boolean> {
  if (!payfastConfigured()) {
    logger.error('PayFast not configured — refusing to trust ITN', new Error('missing merchant config'));
    return false;
  }

  // 1) Recompute the signature over every field except `signature` itself, in
  //    the order PayFast sent them.
  const claimed = postedFields.signature ?? '';
  const forSigning: Array<[string, string]> = Object.entries(postedFields).filter(([k]) => k !== 'signature');
  const expected = signParams(forSigning);
  const a = Buffer.from(claimed);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    logger.warn('PayFast ITN signature mismatch');
    return false;
  }

  // 2) Server-to-server confirmation: post the ITN back and require VALID.
  try {
    const body = Object.entries(postedFields)
      .map(([k, v]) => `${k}=${payfastEncode(v)}`)
      .join('&');
    const res = await fetch(PAYFAST_VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = (await res.text()).trim();
    if (!/^VALID/i.test(text)) {
      logger.warn('PayFast server-side validation did not return VALID', { reply: text.slice(0, 40) });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('PayFast ITN validation call failed', err as Error);
    return false;
  }
}

/** PayFast marks a settled payment with payment_status COMPLETE. */
export function isPaymentComplete(fields: Record<string, string>): boolean {
  return String(fields.payment_status ?? '').toUpperCase() === 'COMPLETE';
}
