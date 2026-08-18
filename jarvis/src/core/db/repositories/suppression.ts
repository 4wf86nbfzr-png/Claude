import { Db, nowIso } from '../database';
import type { SuppressionEntry } from '../../../shared/types';
import { emailDomain, normalizeEmail } from '../../util/text';

const map = (row: Record<string, unknown>): SuppressionEntry => ({
  id: Number(row.id),
  patternType: String(row.pattern_type) as SuppressionEntry['patternType'],
  value: String(row.value),
  reason: (row.reason as string | null) ?? null,
  createdAt: String(row.created_at)
});

/**
 * Sperrliste (§17). Wer widerspricht, landet hier – und wird vom
 * Versandpfad hart ausgeschlossen, unabhängig davon, was ein Agent möchte.
 */
export class SuppressionRepo {
  constructor(private readonly db: Db) {}

  add(value: string, patternType: SuppressionEntry['patternType'] = 'adresse', reason?: string): SuppressionEntry {
    const normalized = patternType === 'adresse' ? normalizeEmail(value) : value.trim().toLowerCase();
    this.db.run(
      `INSERT INTO suppression_list (pattern_type, value, reason, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(pattern_type, value) DO UPDATE SET reason = COALESCE(excluded.reason, suppression_list.reason)`,
      [patternType, normalized, reason ?? null, nowIso()]
    );
    return this.find(patternType, normalized)!;
  }

  find(patternType: SuppressionEntry['patternType'], value: string): SuppressionEntry | null {
    const row = this.db.get('SELECT * FROM suppression_list WHERE pattern_type = ? AND value = ?', [
      patternType,
      value
    ]);
    return row ? map(row) : null;
  }

  /** Ist diese Adresse (oder ihre Domain) gesperrt? Gibt den Grund zurück. */
  blocks(address: string): SuppressionEntry | null {
    const normalized = normalizeEmail(address);
    const direct = this.find('adresse', normalized);
    if (direct) return direct;
    const domain = emailDomain(normalized);
    return domain ? this.find('domain', domain) : null;
  }

  list(): SuppressionEntry[] {
    return this.db.all('SELECT * FROM suppression_list ORDER BY created_at DESC').map(map);
  }

  remove(id: number): boolean {
    return this.db.run('DELETE FROM suppression_list WHERE id = ?', [id]).changes > 0;
  }
}
