/**
 * Sehr schlanker Logger. Bewusst kein pino/winston: der Core soll ohne
 * Transport-Konfiguration in Tests, CLI und Electron-Hauptprozess laufen.
 *
 * Schreibt nach stderr, damit stdout fuer CLI-Ausgaben frei bleibt.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

/** Feldnamen, deren Werte niemals im Log auftauchen duerfen. */
const SECRET_KEYS =
  /(pass|passwort|password|secret|token|api[_-]?key|apikey|authorization|refresh|client[_-]?secret)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[tief verschachtelt]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? '***' : redact(v, depth + 1);
  }
  return out;
}

export interface Logger {
  level: LogLevel;
  child(scope: string): Logger;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(level: LogLevel = 'info', scope = 'jarvis'): Logger {
  const write = (lvl: Exclude<LogLevel, 'silent'>, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < ORDER[logger.level]) return;
    const line = {
      t: new Date().toISOString(),
      lvl,
      scope,
      msg,
      ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
    };
    process.stderr.write(`${JSON.stringify(line)}\n`);
  };

  const logger: Logger = {
    level,
    child: (sub) => {
      const c = createLogger(logger.level, `${scope}:${sub}`);
      return c;
    },
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
  };
  return logger;
}

/** Logger, der nichts tut -- Standard in Tests. */
export const silentLogger: Logger = {
  level: 'silent',
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
