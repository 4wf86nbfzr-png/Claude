import { Db, nowIso } from '../database';
import type { Source } from '../../../shared/types';
import { truncate } from '../../util/text';

export interface SourceInput {
  url: string;
  kind?: Source['kind'];
  title?: string | null;
  httpStatus?: number | null;
  contentHash?: string | null;
  excerpt?: string | null;
}

const map = (row: Record<string, unknown>): Source => ({
  id: Number(row.id),
  url: String(row.url),
  kind: String(row.kind) as Source['kind'],
  title: (row.title as string | null) ?? null,
  httpStatus: row.http_status === null ? null : Number(row.http_status),
  excerpt: (row.excerpt as string | null) ?? null,
  fetchedAt: String(row.fetched_at)
});

/** Quellennachweise (§15): jede recherchierte Aussage hängt an einer Zeile hier. */
export class SourceRepo {
  constructor(private readonly db: Db) {}

  record(input: SourceInput): Source {
    const { lastInsertRowid } = this.db.run(
      `INSERT INTO sources (url, kind, title, http_status, content_hash, excerpt, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.url,
        input.kind ?? 'sonstige',
        input.title ?? null,
        input.httpStatus ?? null,
        input.contentHash ?? null,
        input.excerpt ? truncate(input.excerpt, 400) : null,
        nowIso()
      ]
    );
    return this.byId(lastInsertRowid)!;
  }

  byId(id: number): Source | null {
    const row = this.db.get('SELECT * FROM sources WHERE id = ?', [id]);
    return row ? map(row) : null;
  }

  latestForUrl(url: string): Source | null {
    const row = this.db.get('SELECT * FROM sources WHERE url = ? ORDER BY id DESC LIMIT 1', [url]);
    return row ? map(row) : null;
  }
}
