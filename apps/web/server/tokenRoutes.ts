/**
 * Credit token endpoints.
 *
 * These live on apps/web rather than apps/api or the parser because this is
 * where the session, the user and the organisation are — a wallet route has to
 * know *whose* wallet it is, and only this server can answer that without
 * trusting something the browser sent.
 *
 * The one rule worth stating plainly: the amount charged is never taken from
 * the request. `/authorize` is handed a quote id and asks the parser what that
 * quote costs; `/checkout` is handed a pack id and looks the price up in
 * TOKEN_PACKS. A browser can choose *what* to buy, never *what it costs*.
 */
import type { Express, Request, Response } from "express";
import { createLogger } from "./logger";
import { requireAuth } from "./routes";
import { recordAudit } from "./securityAudit";
import { TokenOrderModel } from "../shared/schema";
import { TOKEN_PACKS, findTokenPack } from "../shared/tokenPacks";
import {
  FREE_TOKEN_GRANT,
  TOKENS_PER_CENT,
  centsToTokens,
  creditTokens,
  debitTokens,
  ensureWallet,
  listLedger,
  setPlan,
} from "./tokenWallet";

const logger = createLogger("TokenRoutes");

const PARSER_BASE = process.env.PARSER_SERVICE_URL || "http://127.0.0.1:3200";
const INTERNAL_SECRET = process.env.PARSER_INTERNAL_SECRET || "";

/**
 * Is uploading actually charged for?
 *
 * Defaults to CHARGING; only an explicit "false" makes uploads free. Same shape
 * as the parser's PARSER_REQUIRE_PAYMENT, and the two are a matched pair — this
 * side decides whether a wallet debit happens, that side decides whether the
 * extraction gate demands a settled quote. Set one without the other and you
 * get the broken half: free here + required there means every upload is refused.
 *
 * Free mode exists because the wallet shipped before PayFast did. With no way
 * to buy tokens, charging would mean nobody can upload at all — so until the
 * merchant account is live, uploads run free and the ledger stays untouched.
 * Flipping this back to charging is a one-variable change, no redeploy of logic.
 *
 * Read per call rather than captured at import so it is testable and so a
 * restart is the only thing needed to change it.
 */
export function paymentRequired(): boolean {
  return process.env.TOKENS_REQUIRE_PAYMENT !== "false";
}

interface SessionUser {
  id: string;
  organizationId?: string | null;
  organizationName?: string | null;
}

/** The caller's organisation, or a 403 that says what to do about it. */
function orgOf(req: Request, res: Response): string | null {
  const user = (req as Request & { user?: SessionUser }).user;
  const orgId = user?.organizationId;
  if (!orgId) {
    res.status(403).json({ message: "You are not part of an organisation yet, so there is no wallet to draw on." });
    return null;
  }
  return orgId;
}

interface ParserQuoteState {
  quoteId: string;
  paymentStatus: string;
  totalCents: number;
  currency: string;
  consumed: boolean;
}

/** Ask the parser what a quote actually costs. Its number, not the browser's. */
async function readParserQuote(quoteId: string): Promise<ParserQuoteState | null> {
  const res = await fetch(`${PARSER_BASE}/api/parser/quotes/${encodeURIComponent(quoteId)}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  const data = body?.data;
  if (!data) return null;
  return {
    quoteId: String(data.quoteId ?? quoteId),
    paymentStatus: String(data.paymentStatus ?? "unknown"),
    totalCents: Number(data.totalCents ?? 0),
    currency: String(data.currency ?? "ZAR"),
    consumed: Boolean(data.consumed),
  };
}

/** Tell the parser's extraction gate that the wallet has paid for this quote. */
async function settleParserQuote(quoteId: string, reference: string): Promise<boolean> {
  if (!INTERNAL_SECRET) {
    logger.error(
      "PARSER_INTERNAL_SECRET is not set — the wallet cannot authorise extraction",
      new Error("missing PARSER_INTERNAL_SECRET"),
    );
    return false;
  }
  try {
    const res = await fetch(`${PARSER_BASE}/api/parser/quotes/${encodeURIComponent(quoteId)}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-okiru-internal-secret": INTERNAL_SECRET },
      body: JSON.stringify({ reference }),
    });
    if (!res.ok) {
      logger.warn("Parser refused the wallet settle", { quoteId, status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("Could not reach the parser to settle a quote", err as Error, { quoteId });
    return false;
  }
}

export function registerTokenRoutes(app: Express): void {
  /** The pill in every header and the billing screen both read this. */
  app.get("/api/tokens/balance", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as Request & { user?: SessionUser }).user;
      const orgId = user?.organizationId;
      if (!orgId) {
        // Not an error: a user without an organisation simply has no wallet
        // yet. The pill hides itself rather than showing a scary zero.
        return res.json({ wallet: null, freeGrant: FREE_TOKEN_GRANT, tokensPerCent: TOKENS_PER_CENT });
      }
      const wallet = await ensureWallet(orgId);
      res.json({ wallet, freeGrant: FREE_TOKEN_GRANT, tokensPerCent: TOKENS_PER_CENT });
    } catch (err) {
      logger.error("GET /api/tokens/balance failed", err as Error);
      res.status(500).json({ message: "Could not read your token balance" });
    }
  });

  /** "Where did my tokens go" — the ledger, newest first. */
  app.get("/api/tokens/ledger", requireAuth, async (req: Request, res: Response) => {
    try {
      const orgId = orgOf(req, res);
      if (!orgId) return;
      const limit = Number(req.query.limit ?? 50);
      const entries = await listLedger(orgId, Number.isFinite(limit) ? limit : 50);
      res.json({ entries });
    } catch (err) {
      logger.error("GET /api/tokens/ledger failed", err as Error);
      res.status(500).json({ message: "Could not read your token history" });
    }
  });

  app.get("/api/tokens/packs", requireAuth, async (_req: Request, res: Response) => {
    res.json({ packs: TOKEN_PACKS });
  });

  /**
   * Price a quote in tokens WITHOUT spending any.
   *
   * The confirmation dialog shows "this batch costs N tokens, you will have M
   * left" before the user commits, and this is where that number comes from —
   * the same conversion `/authorize` will apply, so the figure they approve is
   * the figure they are charged.
   */
  app.get("/api/tokens/quote/:quoteId", requireAuth, async (req: Request, res: Response) => {
    try {
      const orgId = orgOf(req, res);
      if (!orgId) return;
      const quote = await readParserQuote(String(req.params.quoteId));
      if (!quote) return res.status(404).json({ message: "That quote is unknown or has expired." });
      const tokens = paymentRequired() ? centsToTokens(quote.totalCents) : 0;
      const wallet = await ensureWallet(orgId);
      res.json({
        quoteId: quote.quoteId,
        tokens,
        balance: wallet.balance,
        balanceAfter: wallet.balance - tokens,
        // In free mode the price is zero, so the balance is always sufficient
        // and the dialog never warns about a shortfall the user cannot fix —
        // there is nowhere to buy tokens until PayFast is live.
        sufficient: !paymentRequired() || wallet.balance >= tokens,
        shortfall: paymentRequired() ? Math.max(0, tokens - wallet.balance) : 0,
        alreadyAuthorized: quote.paymentStatus === "paid",
        free: !paymentRequired(),
      });
    } catch (err) {
      logger.error("GET /api/tokens/quote failed", err as Error);
      res.status(500).json({ message: "Could not price this batch in tokens" });
    }
  });

  /**
   * Spend tokens on a document batch, then open the parser's extraction gate.
   *
   * Order matters and is not negotiable: debit FIRST, settle second. Settling
   * first would mean a failed debit still left an extractable quote behind —
   * free processing. If the settle fails after a successful debit we refund in
   * the same request, because the customer paid for something they did not get.
   */
  app.post("/api/tokens/authorize", requireAuth, async (req: Request, res: Response) => {
    try {
      const orgId = orgOf(req, res);
      if (!orgId) return;
      const user = (req as Request & { user?: SessionUser }).user;
      const quoteId = String((req.body ?? {}).quoteId ?? "").trim();
      if (!quoteId) return res.status(400).json({ message: "quoteId is required" });

      const quote = await readParserQuote(quoteId);
      if (!quote) return res.status(404).json({ message: "That quote is unknown or has expired. Upload the batch again." });
      if (quote.consumed) {
        return res.status(409).json({ message: "This batch has already been processed." });
      }

      const tokens = centsToTokens(quote.totalCents);
      const reference = `extract:${quoteId}`;

      // FREE MODE. No debit, no ledger entry, no balance check — and no settle
      // either, because the parser's own gate is open in this configuration
      // (PARSER_REQUIRE_PAYMENT=false) and a settle call would need a shared
      // secret that free mode deliberately does not depend on. The response
      // keeps the same shape so the upload UI needs no knowledge of any of this.
      if (!paymentRequired()) {
        await recordAudit(req, {
          action: "tokens.authorize",
          resourceType: "organization",
          resourceId: orgId,
          result: "success",
          metadata: { quoteId, tokens: 0, free: true, wouldHaveCost: tokens },
        });
        return res.json({
          authorized: true,
          quoteId,
          tokensCharged: 0,
          alreadyAuthorized: false,
          free: true,
          balance: (await ensureWallet(orgId)).balance,
        });
      }

      const debit = await debitTokens({
        organizationId: orgId,
        userId: user?.id ?? null,
        amount: tokens,
        reference,
        description: `Document processing — ${tokens.toLocaleString("en-ZA")} tokens`,
        metadata: { quoteId, totalCents: quote.totalCents, currency: quote.currency },
      });

      if (!debit.ok) {
        return res.status(402).json({
          message: `You need ${tokens.toLocaleString("en-ZA")} tokens to process this batch and have ${debit.balance.toLocaleString("en-ZA")}.`,
          code: "INSUFFICIENT_TOKENS",
          required: tokens,
          balance: debit.balance,
          shortfall: debit.shortfall,
        });
      }

      const settled = await settleParserQuote(quoteId, reference);
      if (!settled) {
        // Give the tokens back. They bought processing we could not authorise.
        const refunded = await creditTokens({
          organizationId: orgId,
          userId: user?.id ?? null,
          amount: tokens,
          reference: `refund:${quoteId}`,
          description: "Refund — processing could not be authorised",
          kind: "refund",
          metadata: { quoteId },
        });
        return res.status(502).json({
          message: "We could not start processing, so your tokens were not spent. Try again in a moment.",
          balance: refunded.balance,
        });
      }

      await recordAudit(req, {
        action: "tokens.authorize",
        resourceType: "organization",
        resourceId: orgId,
        result: "success",
        metadata: { quoteId, tokens, balanceAfter: debit.balance },
      });

      res.json({
        authorized: true,
        quoteId,
        tokensCharged: debit.alreadyApplied ? 0 : tokens,
        alreadyAuthorized: debit.alreadyApplied,
        balance: debit.balance,
      });
    } catch (err) {
      logger.error("POST /api/tokens/authorize failed", err as Error);
      res.status(500).json({ message: "Could not authorise this batch" });
    }
  });

  /**
   * Buy tokens. Writes our own order record first, then hands the user to
   * PayFast — what they receive is decided by this record, never by anything
   * the browser sends back on return.
   */
  app.post("/api/tokens/checkout", requireAuth, async (req: Request, res: Response) => {
    try {
      const orgId = orgOf(req, res);
      if (!orgId) return;
      const user = (req as Request & { user?: SessionUser }).user;
      const pack = findTokenPack(String((req.body ?? {}).packId ?? ""));
      if (!pack) return res.status(400).json({ message: "Unknown token pack" });

      const order = await TokenOrderModel.create({
        organizationId: orgId,
        userId: user?.id ?? null,
        packId: pack.id,
        tokens: pack.tokens,
        amountCents: pack.amountCents,
        currency: "ZAR",
        grantsPro: pack.grantsPro,
        status: "pending",
      });

      const { createTokenCheckout } = await import("./payfastTokens");
      const checkout = createTokenCheckout({
        orderId: String(order.id),
        packName: pack.name,
        amountCents: pack.amountCents,
      });

      await recordAudit(req, {
        action: "tokens.checkout",
        resourceType: "organization",
        resourceId: orgId,
        result: "success",
        metadata: { packId: pack.id, orderId: String(order.id), amountCents: pack.amountCents },
      });

      res.json({ orderId: String(order.id), redirectUrl: checkout.redirectUrl, simulated: checkout.simulated });
    } catch (err) {
      logger.error("POST /api/tokens/checkout failed", err as Error);
      res.status(502).json({ message: (err as Error).message || "Could not start the payment" });
    }
  });

  /**
   * PayFast ITN — the ONLY thing that credits a purchase.
   *
   * Public by necessity (PayFast posts here server-to-server), and therefore
   * verified twice: the signature is recomputed, and the ITN is confirmed back
   * with PayFast. The credited amount comes from OUR order record, so even a
   * forged amount buys nothing extra.
   */
  app.post("/api/tokens/webhooks/payfast", async (req: Request, res: Response) => {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.body ?? {})) fields[k] = String(v);

    const orderId = fields.m_payment_id || fields.custom_str1;
    if (!orderId) return res.json({ ignored: true, reason: "no m_payment_id" });

    const { verifyTokenItn, isPaymentComplete } = await import("./payfastTokens");
    const verified = await verifyTokenItn(fields);
    if (!verified) {
      logger.warn("Rejected token ITN that failed verification", { orderId });
      return res.status(400).json({ message: "ITN verification failed" });
    }

    const order = await TokenOrderModel.findOne({ id: orderId });
    if (!order) return res.json({ ignored: true, reason: "unknown order" });

    const paidCents = Math.round(Number(fields.amount_gross ?? fields.amount ?? 0) * 100);
    if (!isPaymentComplete(fields) || paidCents !== Math.round(order.amountCents)) {
      if (String(fields.payment_status ?? "").toUpperCase() === "FAILED") {
        await TokenOrderModel.updateOne({ id: orderId }, { $set: { status: "failed" } });
      } else {
        logger.warn("Token ITN not applied (status or amount mismatch)", {
          orderId,
          status: fields.payment_status,
          paidCents,
          expected: order.amountCents,
        });
      }
      return res.json({ received: true, applied: false });
    }

    const credited = await creditTokens({
      organizationId: order.organizationId,
      userId: order.userId ?? null,
      amount: order.tokens,
      reference: `purchase:${orderId}`,
      description: `Purchase — ${order.packId}`,
      kind: "purchase",
      metadata: { orderId, packId: order.packId, providerRef: fields.pf_payment_id ?? null },
    });

    if (order.grantsPro) {
      const pack = findTokenPack(order.packId);
      const days = pack?.termDays ?? 30;
      const renewsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await setPlan(order.organizationId, "pro", renewsAt);
    }

    await TokenOrderModel.updateOne(
      { id: orderId },
      { $set: { status: "paid", providerRef: fields.pf_payment_id ?? null, settledAt: new Date() } },
    );

    logger.info("Token purchase credited", {
      orderId,
      orgId: order.organizationId,
      tokens: order.tokens,
      balance: credited.balance,
    });
    return res.json({ received: true, applied: true });
  });

  /**
   * Development-only: settle a token order without PayFast so the buy flow can
   * be walked before live keys exist. Hard-gated by the same flag that allows a
   * simulated checkout, which can never be true in production.
   */
  app.post("/api/tokens/orders/:orderId/simulate-payment", requireAuth, async (req: Request, res: Response) => {
    const { simulatedPurchaseAllowed } = await import("./payfastTokens");
    if (!simulatedPurchaseAllowed()) return res.status(404).json({ message: "Not found" });

    const orgId = orgOf(req, res);
    if (!orgId) return;
    const order = await TokenOrderModel.findOne({ id: String(req.params.orderId) });
    if (!order || order.organizationId !== orgId) {
      return res.status(404).json({ message: "Unknown order" });
    }
    if (order.status === "paid") return res.json({ alreadySettled: true });

    const credited = await creditTokens({
      organizationId: orgId,
      userId: (req as Request & { user?: SessionUser }).user?.id ?? null,
      amount: order.tokens,
      reference: `purchase:${order.id}`,
      description: `Purchase — ${order.packId} (simulated)`,
      kind: "purchase",
      metadata: { orderId: order.id, simulated: true },
    });
    if (order.grantsPro) {
      const days = findTokenPack(order.packId)?.termDays ?? 30;
      await setPlan(orgId, "pro", new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString());
    }
    await TokenOrderModel.updateOne({ id: order.id }, { $set: { status: "paid", settledAt: new Date() } });
    logger.warn("Token order settled by SIMULATED payment (development only)", { orderId: order.id });
    res.json({ settled: true, balance: credited.balance });
  });

  logger.info("Token routes registered", { freeGrant: FREE_TOKEN_GRANT, tokensPerCent: TOKENS_PER_CENT });
}
