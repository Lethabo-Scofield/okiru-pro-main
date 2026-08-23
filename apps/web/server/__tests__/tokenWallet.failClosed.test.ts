/**
 * The wallet fails CLOSED in production when its database is away.
 *
 * It used to fall back to an in-memory store, checked per call — which in
 * production with payment enforced meant two things at once:
 *
 *   - Mongo going down handed every organisation a fresh FREE_TOKEN_GRANT from
 *     RAM, so extraction became free for exactly as long as the database was
 *     broken;
 *   - a PayFast credit written during the outage lived only in RAM, so a
 *     customer's real money bought a balance that evaporated on the next
 *     restart.
 *
 * In development and tests the memory store remains — it is the harness this
 * very file runs on — and free mode (TOKENS_REQUIRE_PAYMENT=false) keeps it
 * too, because with no money at stake there is nothing to protect.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureWallet,
  walletIsDurable,
  WalletUnavailableError,
} from "../tokenWallet";

const savedEnv = process.env.NODE_ENV;
const savedPayment = process.env.TOKENS_REQUIRE_PAYMENT;

afterEach(() => {
  process.env.NODE_ENV = savedEnv;
  if (savedPayment === undefined) delete process.env.TOKENS_REQUIRE_PAYMENT;
  else process.env.TOKENS_REQUIRE_PAYMENT = savedPayment;
});

describe("wallet durability gate", () => {
  it("is not durable in this harness (no Mongo connected)", () => {
    expect(walletIsDurable()).toBe(false);
  });

  it("refuses to move tokens in production while the database is away", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.TOKENS_REQUIRE_PAYMENT; // payment defaults to REQUIRED
    await expect(ensureWallet("org-prod")).rejects.toBeInstanceOf(WalletUnavailableError);
  });

  it("still works in production free mode, where no money is at stake", async () => {
    process.env.NODE_ENV = "production";
    process.env.TOKENS_REQUIRE_PAYMENT = "false";
    const wallet = await ensureWallet("org-free");
    expect(wallet.balance).toBeGreaterThan(0);
  });

  it("keeps the memory store for development and tests", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.TOKENS_REQUIRE_PAYMENT;
    const wallet = await ensureWallet("org-dev");
    expect(wallet.balance).toBeGreaterThan(0);
  });
});
