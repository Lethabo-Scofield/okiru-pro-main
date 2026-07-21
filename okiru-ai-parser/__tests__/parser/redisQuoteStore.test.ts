/**
 * The Redis quote store exists to make the payment gate correct across
 * replicas. These tests pin the properties that protect a paying user:
 * cross-replica visibility, and that a concurrent update cannot silently
 * discard another replica's write (paid vs consumed).
 *
 * Backed by a small fake Redis implementing only what the store uses, including
 * WATCH semantics — enough to exercise the retry path without a live server.
 */
import { describe, expect, it } from 'vitest';
import { RedisQuoteStore } from '../../src/services/redisQuoteStore.js';
import type { QuoteRecord } from '../../src/services/quoteStore.js';

/** Shared "server" state — the thing both replicas talk to. */
class FakeRedisServer {
  readonly values = new Map<string, string>();
  /** Bumped on every write so WATCHers can detect a change. */
  readonly versions = new Map<string, number>();

  set(key: string, value: string): void {
    this.values.set(key, value);
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
  }
}

/** One connection to the fake server. WATCH state is per-connection, as in Redis. */
function fakeClient(server: FakeRedisServer, hooks: { beforeExec?: () => void } = {}) {
  let watchedKey: string | null = null;
  let watchedVersion = 0;

  const client = {
    async get(key: string) {
      return server.values.get(key) ?? null;
    },
    async set(key: string, value: string) {
      server.set(key, value);
      return 'OK';
    },
    async watch(key: string) {
      watchedKey = key;
      watchedVersion = server.versions.get(key) ?? 0;
      return 'OK';
    },
    async unwatch() {
      watchedKey = null;
      return 'OK';
    },
    multi() {
      const queued: Array<[string, string]> = [];
      return {
        set(key: string, value: string) {
          queued.push([key, value]);
          return this;
        },
        async exec() {
          // Let a test interleave another replica's write here.
          hooks.beforeExec?.();
          const current = watchedKey ? server.versions.get(watchedKey) ?? 0 : 0;
          if (watchedKey && current !== watchedVersion) return null; // WATCH tripped
          for (const [key, value] of queued) server.set(key, value);
          return queued.map(() => 'OK');
        },
      };
    },
    duplicate() {
      return fakeClient(server, hooks);
    },
    async connect() {
      return undefined;
    },
    async quit() {
      return undefined;
    },
    on() {
      return client;
    },
  };
  return client;
}

function record(overrides: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    quoteId: 'quote_test',
    fingerprint: 'fp',
    currency: 'ZAR',
    totalCents: 200,
    paymentStatus: 'not_started',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000,
    quote: {} as QuoteRecord['quote'],
    ...overrides,
  };
}

describe('RedisQuoteStore', () => {
  it('makes a quote written by one replica visible to another', async () => {
    const server = new FakeRedisServer();
    const replicaA = new RedisQuoteStore(fakeClient(server) as never);
    const replicaB = new RedisQuoteStore(fakeClient(server) as never);

    await replicaA.put(record({ quoteId: 'quote_shared' }));

    // This is the whole point: the in-memory store returned null here, which is
    // how a PayFast ITN on the wrong pod loses someone's payment.
    const seen = await replicaB.get('quote_shared');
    expect(seen).not.toBeNull();
    expect(seen!.quoteId).toBe('quote_shared');
  });

  it('marks an unpaid quote expired once past its expiry', async () => {
    const server = new FakeRedisServer();
    const store = new RedisQuoteStore(fakeClient(server) as never);
    await store.put(record({ quoteId: 'q_old', expiresAt: Date.now() - 1000 }));

    expect((await store.get('q_old'))!.paymentStatus).toBe('expired');
  });

  it('keeps a paid quote paid past expiry so it can still be redeemed', async () => {
    const server = new FakeRedisServer();
    const store = new RedisQuoteStore(fakeClient(server) as never);
    await store.put(record({ quoteId: 'q_paid', paymentStatus: 'paid', expiresAt: Date.now() - 1000 }));

    expect((await store.get('q_paid'))!.paymentStatus).toBe('paid');
  });

  it('does not lose a concurrent write: payment and consumption both survive', async () => {
    const server = new FakeRedisServer();
    const key = 'okiru:parser:quote:quote_race';
    await new RedisQuoteStore(fakeClient(server) as never).put(record({ quoteId: 'quote_race' }));

    // Replica B marks the quote paid (the ITN) in the window between replica A's
    // read and its write. Without WATCH, A's write would erase the payment and
    // the user would be charged for an extraction the gate then refuses.
    let interleaved = false;
    const racing = new RedisQuoteStore(fakeClient(server, {
      beforeExec: () => {
        if (interleaved) return;
        interleaved = true;
        const current = JSON.parse(server.values.get(key)!) as QuoteRecord;
        server.set(key, JSON.stringify({ ...current, paymentStatus: 'paid', paidAt: Date.now() }));
      },
    }) as never);

    const consumedAt = Date.now();
    const result = await racing.update('quote_race', { consumedAt });

    // The retry re-read the paid state, so BOTH facts are true at the end.
    expect(result!.paymentStatus).toBe('paid');
    expect(result!.consumedAt).toBe(consumedAt);
    expect(interleaved).toBe(true);
  });

  it('returns null for an unknown quote so the gate fails closed', async () => {
    const server = new FakeRedisServer();
    const store = new RedisQuoteStore(fakeClient(server) as never);

    expect(await store.get('nope')).toBeNull();
    expect(await store.update('nope', { paymentStatus: 'paid' })).toBeNull();
  });
});
