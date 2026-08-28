/** Zeitquelle als Abhaengigkeit - damit Tests Ablauffristen steuern koennen. */
export interface Clock {
  now(): Date;
  nowIso(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowIso: () => new Date().toISOString(),
};

/** Zufallsquelle als Abhaengigkeit - fuer reproduzierbare IDs im Test. */
export interface IdGenerator {
  next(prefix: string): string;
}

export const cryptoIdGenerator: IdGenerator = {
  next: (prefix: string) => `${prefix}_${globalThis.crypto.randomUUID()}`,
};
