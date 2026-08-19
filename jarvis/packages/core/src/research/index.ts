import type { JarvisEnv } from '../config/env.js';
import type { CredentialService } from '../services/credentials.js';
import { BraveSearch, DuckDuckGoSearch, SerpApiSearch, TavilySearch } from './search/providers.js';
import type { SearchProvider } from './search/types.js';

export * from './search/types.js';
export * from './search/providers.js';
export * from './fetcher.js';
export * from './extract.js';
export * from './verify.js';
export { ResearchService, isPortalDomain, cleanCompanyName } from './service.js';
export type { CompanyProfile } from './service.js';

export function createSearchProvider(env: JarvisEnv, credentials: CredentialService): SearchProvider {
  switch (env.JARVIS_SEARCH_PROVIDER) {
    case 'tavily':
      return new TavilySearch(credentials.get('TAVILY_API_KEY'));
    case 'brave':
      return new BraveSearch(credentials.get('BRAVE_API_KEY'));
    case 'serpapi':
      return new SerpApiSearch(credentials.get('SERPAPI_API_KEY'));
    case 'duckduckgo':
    default:
      return new DuckDuckGoSearch(env.JARVIS_HTTP_USER_AGENT);
  }
}
