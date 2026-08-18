import type { JarvisError, Result } from '../../shared/types.js';
import { err, ok } from '../../shared/types.js';
import { HttpFetcher } from '../research/HttpFetcher.js';
import { extractPage } from '../research/PageExtractor.js';
import type { SettingsService } from '../services/SettingsService.js';
import type { AuditLogService } from '../services/AuditLogService.js';
import type { SystemAgent } from './SystemAgent.js';

export interface BrowserReadResult {
  url: string;
  title: string;
  description: string;
  text: string;
  emails: string[];
  links: Array<{ url: string; text: string }>;
}

export interface BrowserAgentDeps {
  settings: SettingsService;
  audit: AuditLogService;
  system: SystemAgent;
}

/**
 * Reads public web pages for the assistant and opens them in the user's own
 * browser when a human should look at something. It has no headless browser:
 * fetching HTML covers the research use case, and anything that needs a real
 * session belongs in the user's browser, not in an automated one (§12).
 */
export class BrowserAgent {
  readonly name = 'BrowserAgent';
  private fetcher: HttpFetcher | null = null;

  constructor(private readonly deps: BrowserAgentDeps) {}

  private get client(): HttpFetcher {
    const research = this.deps.settings.get().research;
    if (!this.fetcher) {
      this.fetcher = new HttpFetcher({
        userAgent: research.userAgent,
        crawlDelayMs: research.crawlDelayMs,
        respectRobotsTxt: research.respectRobotsTxt,
      });
    }
    return this.fetcher;
  }

  /** Invalidate the cached fetcher after a settings change. */
  reset(): void {
    this.fetcher = null;
  }

  async read(url: string, maxChars = 8000): Promise<Result<BrowserReadResult, JarvisError>> {
    const page = await this.client.fetchPage(url);
    if (!page.ok) return err(page.error);

    const extracted = extractPage(page.value.html, page.value.finalUrl);
    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'webseite.gelesen',
      subject: page.value.finalUrl,
      outcome: 'ok',
      detail: `${extracted.text.length} Zeichen, ${extracted.emails.length} Adressen`,
    });

    return ok({
      url: page.value.finalUrl,
      title: extracted.title,
      description: extracted.description,
      text: extracted.text.slice(0, maxChars),
      emails: extracted.emails.map((email) => email.address),
      links: extracted.links.slice(0, 40),
    });
  }

  open(url: string): Promise<Result<string, JarvisError>> {
    return this.deps.system.openWebsite(url);
  }
}
