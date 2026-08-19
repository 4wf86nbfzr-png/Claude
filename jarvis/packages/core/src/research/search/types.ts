import type { Result } from '../../util/result.js';

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  /** Rang im Trefferbild, 1-basiert. */
  rank: number;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  /** Regionscode wie 'de-DE' -- nicht jeder Anbieter wertet ihn aus. */
  market?: string;
  signal?: AbortSignal;
}

export interface SearchProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  missingConfigHint(): string | null;
  search(options: SearchOptions): Promise<Result<SearchHit[]>>;
}
