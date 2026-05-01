/**
 * Centralised environment validation.
 *
 * Single source of truth for what environment variables this API expects, what
 * format they must take, and what the production-vs-development requirements
 * are. Import `env` anywhere instead of touching `process.env` directly so
 * misconfigurations fail at startup instead of at request time.
 */
import { z } from "zod";
import { createLogger } from "./logger.js";

const logger = createLogger("Env");

const truthy = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1" || v === "yes");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Server
  API_PORT: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  PORT: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),

  // Sessions — REQUIRED in production. We enforce length to make weak/dev
  // secrets immediately obvious instead of silently shipping to prod.
  SESSION_SECRET: z.string().optional(),

  // CORS — comma-separated origins. No hardcoded fallback to leaked infra.
  CORS_ORIGIN: z.string().optional(),

  // Databases — optional at boot (the app degrades gracefully when absent).
  MONGO_URI: z.string().optional(),
  MONGODB_URI: z.string().optional(),
  ARANGO_URL: z.string().url().optional(),
  ARANGO_DATABASE: z.string().optional(),
  ARANGO_USERNAME: z.string().optional(),
  ARANGO_PASSWORD: z.string().optional(),

  // Data layer provider toggle (mongo | inmemory | future…)
  DATA_PROVIDER: z.string().default("mongo"),

  // External services — optional. Validated only if set.
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  // Feature flags
  CERT_EXTRACTION_ON_STARTUP: truthy,
  ALLOW_IN_MEMORY_DB: truthy,
});

export type Env = z.infer<typeof envSchema>;

function load(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    logger.error("Environment validation failed:\n" + errors);
    process.exit(1);
  }

  const env = parsed.data;
  const isProd = env.NODE_ENV === "production";

  // Production-only hard requirements.
  if (isProd) {
    const problems: string[] = [];

    // Session secret: must exist AND be at least 32 chars (rough entropy floor)
    // AND not be the dev placeholder.
    const secret = env.SESSION_SECRET;
    if (!secret) {
      problems.push("SESSION_SECRET is required in production");
    } else if (secret.length < 32) {
      problems.push(
        `SESSION_SECRET is too short (${secret.length} chars; need >= 32)`,
      );
    } else if (/dev[-_]?secret|change[-_]?me|test/i.test(secret)) {
      problems.push("SESSION_SECRET looks like a dev/test placeholder");
    }

    // Mongo session store requires at least one Mongo URI in prod.
    if (!env.MONGO_URI && !env.MONGODB_URI) {
      problems.push(
        "MONGO_URI (or MONGODB_URI) is required in production for session persistence",
      );
    }

    // CORS must be explicit in prod — no implicit "trust everyone" fallback.
    if (!env.CORS_ORIGIN || env.CORS_ORIGIN.trim() === "") {
      problems.push(
        "CORS_ORIGIN is required in production (comma-separated allowed origins)",
      );
    }

    if (problems.length > 0) {
      logger.error(
        "Production environment is misconfigured:\n" +
          problems.map((p) => "  - " + p).join("\n"),
      );
      process.exit(1);
    }
  } else {
    // Development: warn loudly but continue.
    if (!env.SESSION_SECRET) {
      logger.warn(
        "SESSION_SECRET not set — using a development placeholder. DO NOT deploy this way.",
      );
    }
  }

  return env;
}

export const env = load();

export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
