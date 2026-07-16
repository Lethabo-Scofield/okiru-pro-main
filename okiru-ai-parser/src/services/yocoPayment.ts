/**
 * Yoco payment (flow step 6).
 *
 * We use Yoco's HOSTED checkout and nothing else: we create a checkout for an
 * amount, hand the user Yoco's redirectUrl, and wait for Yoco to tell us it was
 * paid. Deliberately, this service:
 *
 *   - never renders, receives, stores or logs a card number, CVV or PAN;
 *   - never marks a quote paid on the browser's say-so — only a verified Yoco
 *     webhook (or a server-side re-check against Yoco) may do that;
 *   - fails CLOSED when it isn't configured, so a missing key can never
 *     accidentally make extraction free.
 *
 * Secrets come from the environment (YOCO_SECRET_KEY, YOCO_WEBHOOK_SECRET) and
 * must never be committed or hard-coded.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createLogger } from '../logger.js';

const logger = createLogger('YocoPayment');

const YOCO_CHECKOUT_URL = process.env.YOCO_CHECKOUT_URL || 'https://payments.yoco.com/api/checkouts';
const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY || '';
const YOCO_WEBHOOK_SECRET = process.env.YOCO_WEBHOOK_SECRET || '';
const PUBLIC_BASE_URL = (process.env.PARSER_PUBLIC_BASE_URL || 'https://okiru.pro').replace(/\/+$/, '');

/**
 * Local-only escape hatch so the flow can be exercised without live keys.
 * Hard-gated: it can NEVER be true in production, regardless of env.
 */
export function simulatedPaymentAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.PARSER_ALLOW_SIMULATED_PAYMENT === 'true';
}

export function yocoConfigured(): boolean {
  return YOCO_SECRET_KEY.length > 0;
}

export interface YocoCheckout {
  checkoutId: string;
  redirectUrl: string;
  simulated: boolean;
}

/**
 * Create a Yoco checkout for a quote. Amount is in cents and must be an integer
 * — Yoco rejects fractional cents, and rounding here (rather than at display)
 * is what keeps "what we charge" identical to "what we showed".
 */
export async function createYocoCheckout(params: {
  quoteId: string;
  amountCents: number;
  currency: string;
}): Promise<YocoCheckout> {
  const amount = Math.round(params.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Checkout amount must be a positive number of cents');
  }

  if (!yocoConfigured()) {
    if (simulatedPaymentAllowed()) {
      logger.warn('YOCO_SECRET_KEY is not set — issuing a SIMULATED checkout (local development only)', {
        quoteId: params.quoteId,
      });
      return {
        checkoutId: `sim_${params.quoteId}`,
        redirectUrl: `${PUBLIC_BASE_URL}/create-scorecard/payment/simulated?quote=${encodeURIComponent(params.quoteId)}`,
        simulated: true,
      };
    }
    // Fail closed: no key, no payment, no extraction.
    throw new Error('Payments are not configured (YOCO_SECRET_KEY missing)');
  }

  const response = await fetch(YOCO_CHECKOUT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${YOCO_SECRET_KEY}`,
      'Content-Type': 'application/json',
      // Yoco de-duplicates retries on this; one quote must never be charged twice.
      'Idempotency-Key': params.quoteId,
    },
    body: JSON.stringify({
      amount,
      currency: params.currency,
      successUrl: `${PUBLIC_BASE_URL}/create-scorecard/payment/success?quote=${encodeURIComponent(params.quoteId)}`,
      cancelUrl: `${PUBLIC_BASE_URL}/create-scorecard/payment/cancelled?quote=${encodeURIComponent(params.quoteId)}`,
      failureUrl: `${PUBLIC_BASE_URL}/create-scorecard/payment/failed?quote=${encodeURIComponent(params.quoteId)}`,
      metadata: { quoteId: params.quoteId, product: 'okiru-ai-parser' },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.error('Yoco checkout creation failed', new Error(`${response.status} ${detail.slice(0, 200)}`));
    throw new Error(`Could not start payment (Yoco returned ${response.status})`);
  }

  const body = (await response.json()) as { id?: string; redirectUrl?: string };
  if (!body.redirectUrl || !body.id) {
    throw new Error('Yoco did not return a redirect URL');
  }

  return { checkoutId: body.id, redirectUrl: body.redirectUrl, simulated: false };
}

/**
 * Verify a Yoco webhook signature before believing a word of it. An unsigned or
 * badly-signed payload is an attacker claiming "this quote is paid".
 *
 * Yoco signs as: HMAC-SHA256 over `id.timestamp.body`, base64, using the
 * webhook secret (the `whsec_...` value, base64 after the prefix).
 */
export function verifyYocoWebhook(params: {
  id: string;
  timestamp: string;
  rawBody: string;
  signatureHeader: string;
}): boolean {
  if (!YOCO_WEBHOOK_SECRET) {
    logger.error('YOCO_WEBHOOK_SECRET is not set — refusing to trust webhook', new Error('missing webhook secret'));
    return false;
  }

  try {
    const secretBytes = Buffer.from(YOCO_WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64');
    const signedContent = `${params.id}.${params.timestamp}.${params.rawBody}`;
    const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');

    // Header can carry several space-separated `v1,<sig>` pairs.
    const candidates = params.signatureHeader
      .split(' ')
      .map((part) => (part.includes(',') ? part.split(',')[1] : part))
      .filter(Boolean);

    return candidates.some((candidate) => {
      const a = Buffer.from(candidate);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
  } catch (err) {
    logger.error('Yoco webhook signature check threw', err as Error);
    return false;
  }
}

/** Yoco event types we care about. */
export function isPaymentSucceeded(eventType: string): boolean {
  return eventType === 'payment.succeeded';
}
export function isPaymentFailed(eventType: string): boolean {
  return eventType === 'payment.failed' || eventType === 'payment.cancelled';
}
