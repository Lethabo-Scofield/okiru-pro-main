type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVELS: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const envLevel = process.env.LOG_LEVEL?.toUpperCase() as LogLevel | undefined;
const currentLevel: LogLevel = envLevel && envLevel in LOG_LEVELS ? envLevel : 'INFO';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function emit(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>, error?: unknown): void {
  if (!shouldLog(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    module,
    msg: message,
    ...meta,
    ...(error instanceof Error ? { error: { name: error.name, message: error.message, stack: error.stack } } : {}),
  };
  const line = process.env.NODE_ENV === 'production'
    ? JSON.stringify(entry)
    : `${entry.ts} ${level} [${module}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}${error instanceof Error ? ` ${error.message}` : ''}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

export function createLogger(module: string) {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      emit('DEBUG', module, message, meta);
    },
    info(message: string, meta?: Record<string, unknown>) {
      emit('INFO', module, message, meta);
    },
    warn(message: string, meta?: Record<string, unknown>) {
      emit('WARN', module, message, meta);
    },
    error(message: string, error?: unknown, meta?: Record<string, unknown>) {
      emit('ERROR', module, message, meta, error);
    },
  };
}
