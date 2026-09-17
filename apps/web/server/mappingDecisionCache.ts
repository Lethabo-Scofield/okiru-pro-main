/**
 * Durable cache for MAPPING DECISIONS — the model's answer to "which field does
 * this column mean".
 *
 * WHY THIS EXISTS
 *
 * `aiMappingRoutes` asks a model which target field an unmatched column means,
 * and asks again on every single import. The call sets `temperature: 0`, which
 * is a request, not a guarantee — the gpt-5-family deployments reject a
 * temperature override outright, so every ask is sampled afresh. The same
 * workbook can therefore be read two ways on two days: one where `Total Cost`
 * maps to the cost field and one where it does not. A column that fails to map
 * contributes NOTHING to the score. That is a published compliance number
 * moving on identical evidence, which is the one thing a verification tool may
 * never do.
 *
 * Widening when the model is consulted — which the ambiguity work just did —
 * makes this MORE consequential, not less: more decisions now go to the model,
 * so more of them need pinning.
 *
 * The architecture is the one already committed to elsewhere: the AI decides
 * what things MEAN, the code decides what they SCORE, and the meaning is decided
 * ONCE per template and then applied deterministically. This module is the
 * "once".
 *
 * KEYED BY TEMPLATE, NOT BY FILE
 *
 * The fingerprint is the QUESTION — the sorted column headers plus the sorted
 * field keys on offer — never the file name, the client, or the sample rows.
 * Two clients submitting the same gathering workbook share one decision; a
 * workbook whose columns genuinely differ gets its own. Sorting matters:
 * column ORDER is a property of an export, not of what the columns mean.
 *
 * RELATIONSHIP TO THE PARSER'S CACHE
 *
 * `okiru-ai-parser/src/services/semanticDecisionCache.ts` implements this same
 * contract, and this is deliberately a SECOND implementation rather than a
 * shared one: the parser is not in the pnpm workspace (the globs are `apps/*`
 * and `packages/*`), `apps/web` has no workspace dependencies, and `redis` is
 * not among its packages. Extracting `packages/decision-cache` and having both
 * depend on it is the right end state and is NOT done here — so this file is
 * exactly the kind of mirrored copy that drifts. It is small, its contract is
 * stated above, and the divergence risk is real. Treat the two as one thing
 * that happens to be typed twice until the package exists.
 *
 * NEVER THROWS INTO THE REQUEST PATH. A cache outage degrades to "ask the model
 * again", which is the old behaviour, not a failed import.
 */
import { createHash } from "node:crypto";
import { createLogger } from "./logger";

const logger = createLogger("MappingDecisionCache");

const KEY_PREFIX = "okiru:web:mapping:";

/**
 * Long by design: a decision is a property of a TEMPLATE, not of a run, and the
 * fingerprint already invalidates it the moment the columns change.
 */
const DEFAULT_TTL_SECONDS = Number(
  process.env.MAPPING_DECISION_TTL_SECONDS ?? 30 * 24 * 60 * 60,
);
const MEMORY_MAX_ENTRIES = Number(process.env.MAPPING_DECISION_MAX ?? 2000);

export function mappingCacheEnabled(): boolean {
  return process.env.MAPPING_DECISION_CACHE !== "false";
}

interface DecisionStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** In-process LRU — the fallback when Redis is absent or unreachable. */
class MemoryDecisionStore implements DecisionStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    // Refresh recency: Map preserves insertion order, so re-inserting keeps a
    // frequently-read decision away from the eviction end.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    while (this.entries.size > MEMORY_MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

let store: DecisionStore = new MemoryDecisionStore();
let initPromise: Promise<void> | null = null;

/**
 * Connect to Redis once, lazily, and only if the package is actually installed.
 *
 * `redis` is NOT a declared dependency of apps/web, so the import is dynamic and
 * its absence is an expected, logged outcome rather than a crash. Without it the
 * cache is per-process: with more than one web replica the same workbook can
 * still be decided two ways depending on which pod answers. That is strictly
 * better than today (no cache at all) and strictly worse than Redis — the log
 * line says which one is in force so nobody has to guess.
 */
async function ensureStore(): Promise<DecisionStore> {
  if (!initPromise) {
    initPromise = (async () => {
      const url = process.env.REDIS_URL;
      if (!url) {
        logger.warn(
          "REDIS_URL unset — mapping decisions are cached per process only. " +
            "With more than one replica the same workbook can still map two ways.",
        );
        return;
      }
      try {
        const redis = await import("redis").catch(() => null);
        if (!redis?.createClient) {
          logger.warn(
            "redis package not installed in apps/web — mapping decisions are cached per process only.",
          );
          return;
        }
        const password = process.env.REDIS_PASSWORD;
        const client = redis.createClient({
          url,
          ...(password && !url.includes("@") ? { password } : {}),
        });
        // Without a listener a connection error is an unhandled 'error' event
        // and takes the process down.
        client.on("error", (err: unknown) =>
          logger.error("Redis mapping cache error", err as Error),
        );
        await client.connect();
        store = {
          get: (key) => client.get(key) as Promise<string | null>,
          set: async (key, value, ttlSeconds) => {
            await client.set(key, value, { EX: ttlSeconds });
          },
        };
        logger.info("Mapping decisions shared across replicas via Redis");
      } catch (err) {
        logger.warn("Redis unavailable for mapping decisions — using a per-process cache", {
          reason: (err as Error).message,
        });
      }
    })();
  }
  await initPromise;
  return store;
}

/**
 * A stable fingerprint for the thing the decision is ABOUT.
 *
 * Case- and whitespace-insensitive, so "Total Cost (R)" and "total cost (r)"
 * are one template.
 */
export function decisionFingerprint(parts: Array<string | number | undefined | null>): string {
  const normalised = parts
    .map((part) => String(part ?? "").toLowerCase().replace(/\s+/g, " ").trim())
    .join(" ");
  return createHash("sha256").update(normalised).digest("hex").slice(0, 32);
}

/**
 * The fingerprint for a column-mapping question: which of THESE fields do THESE
 * headers mean. Both lists are sorted — order is a property of the export.
 */
export function columnQuestionFingerprint(headers: string[], fieldKeys: string[]): string {
  return decisionFingerprint([
    "columns-v1",
    [...headers].map((h) => h.trim()).sort().join("|"),
    [...fieldKeys].sort().join("|"),
  ]);
}

/**
 * The fingerprint for "what does this typed value mean in this field".
 *
 * The RAW VALUE is part of the question — unlike a column mapping, which is
 * about the template. Leave it out and every value typed into a field replays
 * the first one's answer, which is far worse than the drift being fixed.
 *
 * Lives here rather than in the route so the route and its test cannot build
 * the key two different ways.
 */
export function suggestValueFingerprint(q: {
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  allowedValues: string[];
  validationMessage: string;
  dateFormat: string;
  rawValue: string;
}): string {
  return decisionFingerprint([
    "suggest-value-v1",
    q.fieldKey,
    q.fieldLabel,
    q.fieldType,
    [...q.allowedValues].sort().join("|"),
    q.validationMessage,
    q.dateFormat,
    q.rawValue,
  ]);
}

/**
 * The fingerprint for normalising a spreadsheet's sector / scorecard / year-end
 * onto the strict enums. The allowed lists are part of the question, so adding
 * a sector re-asks rather than replaying an answer chosen from the old menu.
 */
export function excelImportNormalizeFingerprint(q: {
  sector?: string;
  scorecardType?: string;
  financialYearEnd?: string;
  allowedSectors: string;
  allowedTypes: string;
}): string {
  return decisionFingerprint([
    "excel-import-normalize-v1",
    q.sector ?? "",
    q.scorecardType ?? "",
    q.financialYearEnd ?? "",
    q.allowedSectors,
    q.allowedTypes,
  ]);
}

/**
 * Thrown from inside `compute` for a reply that is EMPTY rather than negative.
 *
 * The distinction matters because `null` is cached and a throw is not. A model
 * that considered the question and mapped nothing is a decision worth freezing;
 * a model that returned no content at all is a hiccup, and freezing "no
 * suggestion" for thirty days over one blank response would make an interactive
 * feature permanently useless for that value.
 *
 * Callers catch this and degrade exactly as they did before the cache existed.
 */
export class EmptyModelReplyError extends Error {
  constructor(message = "Model returned no content") {
    super(message);
    this.name = "EmptyModelReplyError";
  }
}

export interface RememberedDecision<T> {
  value: T | null;
  /** True when the answer came from a prior run rather than a fresh model call. */
  replayed: boolean;
}

/**
 * Return the remembered decision, or make it once and remember it.
 *
 * `compute` MUST throw on a transient failure (the model call itself failing)
 * and return null for a considered "no decision". The first is not cached — a
 * 429 must never freeze into "this template has no mapping" for thirty days —
 * and the second is, because re-rolling a non-answer is exactly the drift being
 * removed.
 */
export async function rememberDecision<T>(
  namespace: string,
  fingerprint: string,
  compute: () => Promise<T | null>,
): Promise<RememberedDecision<T>> {
  if (!mappingCacheEnabled()) {
    return { value: await compute(), replayed: false };
  }

  const key = `${KEY_PREFIX}${namespace}:${fingerprint}`;
  let active: DecisionStore;
  try {
    active = await ensureStore();
  } catch {
    return { value: await compute(), replayed: false };
  }

  try {
    const raw = await active.get(key);
    if (raw !== null) return { value: JSON.parse(raw) as T | null, replayed: true };
  } catch (err) {
    logger.warn("Mapping cache read failed — asking the model", {
      namespace,
      reason: (err as Error).message,
    });
  }

  const value = await compute();

  try {
    await active.set(key, JSON.stringify(value ?? null), DEFAULT_TTL_SECONDS);
  } catch (err) {
    logger.warn("Mapping cache write failed — the decision will be re-made next run", {
      namespace,
      reason: (err as Error).message,
    });
  }

  return { value, replayed: false };
}

/** Test seam: drop the in-process store and any Redis connection attempt. */
export function resetMappingCacheForTest(): void {
  store = new MemoryDecisionStore();
  initPromise = null;
}
