import { AsyncLocalStorage } from 'node:async_hooks';

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LOG_LEVELS: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const VALID_LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];
const envLevel = process.env.LOG_LEVEL?.toUpperCase();
const currentLevel: LogLevel = VALID_LEVELS.includes(envLevel as LogLevel) ? (envLevel as LogLevel) : "DEBUG";
const isProd = process.env.NODE_ENV === "production";

export interface RequestContext {
  requestId: string;
  userId?: string;
  method?: string;
  path?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...((err as any).code ? { code: (err as any).code } : {}),
      ...((err as any).status ? { status: (err as any).status } : {}),
      ...((err as any).statusCode ? { statusCode: (err as any).statusCode } : {}),
    };
  }
  if (err !== undefined && err !== null) return { message: String(err) };
  return {};
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: "\x1b[36m",  // cyan
  INFO:  "\x1b[32m",  // green
  WARN:  "\x1b[33m",  // yellow
  ERROR: "\x1b[31m",  // red
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

function prettyFormat(entry: Record<string, unknown>): string {
  const { ts, level, module, msg, requestId, ...rest } = entry;
  const color = LEVEL_COLORS[level as LogLevel] || "";
  const rid = requestId ? ` ${DIM}rid=${requestId}${RESET}` : "";
  const metaKeys = Object.keys(rest);
  const metaStr = metaKeys.length > 0 ? ` ${DIM}${JSON.stringify(rest)}${RESET}` : "";
  return `${DIM}${ts}${RESET} ${color}${level}${RESET} [${module}]${rid} ${msg}${metaStr}`;
}

function buildEntry(
  level: LogLevel,
  module: string,
  message: string,
  meta?: Record<string, unknown>,
  error?: unknown,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const ctx = requestContext.getStore();
  return {
    ts: new Date().toISOString(),
    level,
    module,
    msg: message,
    ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx?.userId ? { userId: ctx.userId } : {}),
    ...extra,
    ...meta,
    ...(error !== undefined && error !== null ? { error: serializeError(error) } : {}),
  };
}

function emit(level: LogLevel, entry: Record<string, unknown>): void {
  const output = isProd ? JSON.stringify(entry) : prettyFormat(entry);
  if (level === "ERROR") console.error(output);
  else if (level === "WARN") console.warn(output);
  else console.log(output);
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): Logger;
}

export function createLogger(module: string, defaults?: Record<string, unknown>): Logger {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      if (shouldLog("DEBUG")) emit("DEBUG", buildEntry("DEBUG", module, message, meta, undefined, defaults));
    },
    info(message: string, meta?: Record<string, unknown>) {
      if (shouldLog("INFO")) emit("INFO", buildEntry("INFO", module, message, meta, undefined, defaults));
    },
    warn(message: string, meta?: Record<string, unknown>) {
      if (shouldLog("WARN")) emit("WARN", buildEntry("WARN", module, message, meta, undefined, defaults));
    },
    error(message: string, error?: unknown, meta?: Record<string, unknown>) {
      if (shouldLog("ERROR")) emit("ERROR", buildEntry("ERROR", module, message, meta, error, defaults));
    },
    child(extra: Record<string, unknown>): Logger {
      return createLogger(module, { ...defaults, ...extra });
    },
  };
}
