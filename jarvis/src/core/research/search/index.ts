import type { JarvisConfig } from '../../services/config';
import type { CredentialService } from '../../services/credentials';
import {
  BraveSearchProvider,
  KeineSucheProvider,
  SerpApiSearchProvider,
  TavilySearchProvider,
  type SearchProvider
} from './providers';

export * from './providers';

export function createSearchProvider(config: JarvisConfig, credentials: CredentialService): SearchProvider {
  switch (config.search.provider) {
    case 'brave':
      return new BraveSearchProvider(credentials.get('BRAVE_API_KEY'));
    case 'tavily':
      return new TavilySearchProvider(credentials.get('TAVILY_API_KEY'));
    case 'serpapi':
      return new SerpApiSearchProvider(credentials.get('SERPAPI_API_KEY'));
    default:
      return new KeineSucheProvider();
  }
}
