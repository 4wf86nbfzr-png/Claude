import { redact } from '@jarvis/security';

/**
 * Strukturierter JSON-Logger.
 *
 * Bewusst ohne externe Abhaengigkeit: der Logger ist die Stelle, an der
 * Geheimnisse und Nachrichteninhalte herausfallen muessen. Diese Verantwortung
 * soll nicht in einer Fremdbibliothek und ihrer Konfiguration liegen, wo ein
 * Versions-Upgrade sie stillschweigend aendern kann. Jede Zeile geht durch
 * `redact()`, ohne Ausnahme und ohne Schalter.
 */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogRecord {
  readonly time: string;
  readonly level: LogLevel;
  readonly msg: string;
  readonly component: string;
  readonly [key: string]: unknown;
}

export interface LogWriter {
  write(line: string): void;
}

const stdoutWriter: LogWriter = {
  write: (line) => {
    process.stdout.write(`${line}\n`);
  },
};

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly component?: string;
  readonly writer?: LogWriter;
  readonly base?: Record<string, unknown>;
  /** Nur fuer lokales Debugging. In Produktion immer false. */
  readonly allowMessageBodies?: boolean;
}

export class Logger {
  private readonly level: LogLevel;
  private readonly component: string;
  private readonly writer: LogWriter;
  private readonly base: Record<string, unknown>;
  private readonly allowMessageBodies: boolean;

  constructor(opts: LoggerOptions = {}) {
    this.level = opts.level ?? (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info';
    this.component = opts.component ?? 'jarvis';
    this.writer = opts.writer ?? stdoutWriter;
    this.base = opts.base ?? {};
    this.allowMessageBodies =
      opts.allowMessageBodies ?? process.env['LOG_MESSAGE_BODIES'] === 'true';
  }

  child(component: string, base: Record<string, unknown> = {}): Logger {
    return new Logger({
      level: this.level,
      component: `${this.component}.${component}`,
      writer: this.writer,
      base: { ...this.base, ...base },
      allowMessageBodies: this.allowMessageBodies,
    });
  }

  private emit(level: LogLevel, msg: string, fields: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const safe = redact({ ...this.base, ...fields }, {
      allowMessageBodies: this.allowMessageBodies,
    }) as Record<string, unknown>;
    const record: LogRecord = {
      time: new Date().toISOString(),
      level,
      msg,
      component: this.component,
      ...safe,
    };
    try {
      this.writer.write(JSON.stringify(record));
    } catch {
      this.writer.write(
        JSON.stringify({ time: record.time, level: 'error', component: this.component, msg: 'log_serialisierung_fehlgeschlagen' }),
      );
    }
  }

  debug(msg: string, fields: Record<string, unknown> = {}): void {
    this.emit('debug', msg, fields);
  }
  info(msg: string, fields: Record<string, unknown> = {}): void {
    this.emit('info', msg, fields);
  }
  warn(msg: string, fields: Record<string, unknown> = {}): void {
    this.emit('warn', msg, fields);
  }
  error(msg: string, fields: Record<string, unknown> = {}): void {
    this.emit('error', msg, fields);
  }
}

/** Sammelt Zeilen im Speicher - fuer Tests, die die Redaction pruefen. */
export class MemoryLogWriter implements LogWriter {
  readonly lines: string[] = [];
  write(line: string): void {
    this.lines.push(line);
  }
  get text(): string {
    return this.lines.join('\n');
  }
  records(): LogRecord[] {
    return this.lines.map((l) => JSON.parse(l) as LogRecord);
  }
}

export const rootLogger = new Logger();
