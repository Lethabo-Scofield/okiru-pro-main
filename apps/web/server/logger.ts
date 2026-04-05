type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const VALID_LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];
const envLevel = process.env.LOG_LEVEL?.toUpperCase();
const currentLevel: LogLevel = VALID_LEVELS.includes(envLevel as LogLevel) ? (envLevel as LogLevel) : "DEBUG";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): string {
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp()} [${level}] [${module}] ${message}${metaStr}`;
}

export function createLogger(module: string) {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      if (shouldLog("DEBUG")) console.log(formatMessage("DEBUG", module, message, meta));
    },
    info(message: string, meta?: Record<string, unknown>) {
      if (shouldLog("INFO")) console.log(formatMessage("INFO", module, message, meta));
    },
    warn(message: string, meta?: Record<string, unknown>) {
      if (shouldLog("WARN")) console.warn(formatMessage("WARN", module, message, meta));
    },
    error(message: string, error?: unknown, meta?: Record<string, unknown>) {
      if (shouldLog("ERROR")) {
        const errMsg = error instanceof Error ? error.message : String(error || "");
        const errStack = error instanceof Error ? error.stack : undefined;
        console.error(formatMessage("ERROR", module, message, { ...meta, error: errMsg, ...(errStack ? { stack: errStack } : {}) }));
      }
    },
  };
}
