/**
 * Websuche.
 *
 * Vier Wege, damit die Recherche nicht an einem Anbieter hängt. Ohne
 * hinterlegten Schlüssel bleibt die DuckDuckGo-Variante — die funktioniert
 * ohne Anmeldung, liefert aber weniger und ist launischer. Für ernsthafte
 * Recherche ist Brave oder Tavily die bessere Wahl.
 */
import * as cheerio from 'cheerio'
import { getSecret } from '../services/credentials'
import { getSettings } from '../services/settings'
import type { SearchProviderId } from '@shared/types'

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

export class SearchUnavailableError extends Error {
  constructor(
    message: string,
    readonly hint: string
  ) {
    super(message)
    this.name = 'SearchUnavailableError'
  }
}

async function braveSearch(query: string, count: number, signal?: AbortSignal): Promise<SearchHit[]> {
  const key = getSecret('BRAVE_SEARCH_API_KEY')
  if (!key) {
    throw new SearchUnavailableError(
      'Für Brave Search ist kein Schlüssel hinterlegt.',
      'Einstellungen -> Zugänge -> BRAVE_SEARCH_API_KEY eintragen, oder in den Einstellungen einen anderen Suchanbieter wählen.'
    )
  }
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(Math.min(count, 20)))
  url.searchParams.set('country', 'DE')
  url.searchParams.set('search_lang', 'de')

  const response = await fetch(url, {
    headers: { accept: 'application/json', 'x-subscription-token': key },
    signal: signal ?? null
  })
  if (!response.ok) throw new Error(`Brave Search antwortete mit HTTP ${response.status}.`)

  const data = (await response.json()) as { web?: { results?: { title: string; url: string; description?: string }[] } }
  return (data.web?.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description ?? ''
  }))
}

async function tavilySearch(query: string, count: number, signal?: AbortSignal): Promise<SearchHit[]> {
  const key = getSecret('TAVILY_API_KEY')
  if (!key) {
    throw new SearchUnavailableError(
      'Für Tavily ist kein Schlüssel hinterlegt.',
      'Einstellungen -> Zugänge -> TAVILY_API_KEY eintragen.'
    )
  }
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: Math.min(count, 20), search_depth: 'basic' }),
    signal: signal ?? null
  })
  if (!response.ok) throw new Error(`Tavily antwortete mit HTTP ${response.status}.`)

  const data = (await response.json()) as { results?: { title: string; url: string; content?: string }[] }
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content ?? '' }))
}

async function serpApiSearch(query: string, count: number, signal?: AbortSignal): Promise<SearchHit[]> {
  const key = getSecret('SERPAPI_API_KEY')
  if (!key) {
    throw new SearchUnavailableError(
      'Für SerpAPI ist kein Schlüssel hinterlegt.',
      'Einstellungen -> Zugänge -> SERPAPI_API_KEY eintragen.'
    )
  }
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('num', String(Math.min(count, 20)))
  url.searchParams.set('hl', 'de')
  url.searchParams.set('gl', 'de')
  url.searchParams.set('api_key', key)

  const response = await fetch(url, { signal: signal ?? null })
  if (!response.ok) throw new Error(`SerpAPI antwortete mit HTTP ${response.status}.`)

  const data = (await response.json()) as { organic_results?: { title: string; link: string; snippet?: string }[] }
  return (data.organic_results ?? []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet ?? '' }))
}

/** Notlösung ohne Schlüssel: die HTML-Oberfläche von DuckDuckGo. */
async function duckDuckGoSearch(query: string, count: number, signal?: AbortSignal): Promise<SearchHit[]> {
  const response = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': getSettings().research.userAgent,
      'accept-language': 'de-DE,de;q=0.9'
    },
    body: new URLSearchParams({ q: query, kl: 'de-de' }).toString(),
    signal: signal ?? null
  })
  if (!response.ok) {
    throw new SearchUnavailableError(
      `Die DuckDuckGo-Notlösung antwortete mit HTTP ${response.status}.`,
      'Bitte einen Suchanbieter mit Schlüssel einrichten (Brave oder Tavily) — die schlüssellose Variante wird oft gedrosselt.'
    )
  }

  const $ = cheerio.load(await response.text())
  const hits: SearchHit[] = []

  $('.result').each((_, element) => {
    if (hits.length >= count) return
    const anchor = $(element).find('a.result__a').first()
    const rawHref = anchor.attr('href') ?? ''
    if (!rawHref) return

    // DuckDuckGo verpackt Ziele in einen Weiterleitungslink.
    let url = rawHref
    try {
      const parsed = new URL(rawHref, 'https://duckduckgo.com')
      const target = parsed.searchParams.get('uddg')
      if (target) url = target
      else if (parsed.protocol === 'http:' || parsed.protocol === 'https:') url = parsed.toString()
    } catch {
      return
    }
    if (!/^https?:\/\//.test(url)) return

    hits.push({
      title: anchor.text().replace(/\s+/g, ' ').trim(),
      url,
      snippet: $(element).find('.result__snippet').text().replace(/\s+/g, ' ').trim()
    })
  })

  if (hits.length === 0) {
    throw new SearchUnavailableError(
      'Die DuckDuckGo-Notlösung hat keine Treffer geliefert (vermutlich gedrosselt).',
      'Bitte BRAVE_SEARCH_API_KEY oder TAVILY_API_KEY hinterlegen und den Suchanbieter umstellen.'
    )
  }
  return hits
}

const PROVIDERS: Record<SearchProviderId, (q: string, n: number, s?: AbortSignal) => Promise<SearchHit[]>> = {
  brave: braveSearch,
  tavily: tavilySearch,
  serpapi: serpApiSearch,
  duckduckgo: duckDuckGoSearch
}

export async function searchWeb(
  query: string,
  options: { maxResults?: number; provider?: SearchProviderId; signal?: AbortSignal } = {}
): Promise<{ provider: SearchProviderId; hits: SearchHit[] }> {
  const settings = getSettings()
  const provider = options.provider ?? settings.search.provider
  const count = options.maxResults ?? settings.search.maxResults
  const run = PROVIDERS[provider]
  if (!run) throw new SearchUnavailableError(`Unbekannter Suchanbieter "${provider}".`, 'Einstellungen prüfen.')

  const hits = await run(query, count, options.signal)
  // Doppelte URLs fliegen raus — die Suche liefert oft dieselbe Seite mehrfach.
  const seen = new Set<string>()
  const unique = hits.filter((hit) => {
    const key = hit.url.replace(/[#?].*$/, '').replace(/\/$/, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { provider, hits: unique.slice(0, count) }
}
