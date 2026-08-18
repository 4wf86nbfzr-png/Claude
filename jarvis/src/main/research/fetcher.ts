/**
 * Höflicher HTTP-Abruf.
 *
 * Die Recherche liest öffentliche Unternehmensseiten. Damit das niemandem
 * zur Last fällt und nachvollziehbar bleibt:
 *   - eigener User-Agent, der sagt, wer da unterwegs ist,
 *   - robots.txt wird gelesen und beachtet,
 *   - Pause zwischen zwei Abrufen derselben Domain,
 *   - harte Größen- und Zeitgrenze,
 *   - jeder Abruf bekommt einen Hash, damit später belegbar ist, worauf sich
 *     eine Angabe stützt.
 */
import { createHash } from 'node:crypto'
import { getSettings } from '../services/settings'

export interface FetchedPage {
  url: string
  finalUrl: string
  status: number
  html: string
  contentHash: string
  fetchedAt: string
  contentType: string
}

const MAX_BYTES = 2_000_000
const TIMEOUT_MS = 20_000

const lastRequestByHost = new Map<string, number>()
const robotsCache = new Map<string, { rules: string[]; allowAll: boolean }>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function throttle(host: string): Promise<void> {
  const delay = getSettings().research.requestDelayMs
  const last = lastRequestByHost.get(host)
  const now = Date.now()
  if (last !== undefined) {
    const wait = last + delay - now
    if (wait > 0) await sleep(wait)
  }
  lastRequestByHost.set(host, Date.now())
}

async function rawFetch(url: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onAbort = (): void => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    return await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': getSettings().research.userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'de-DE,de;q=0.9,en;q=0.5'
      },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Minimale robots.txt-Auswertung: gesammelt werden die Disallow-Regeln, die
 * für "*" oder unseren User-Agent gelten. Bewusst konservativ — im Zweifel
 * wird nicht abgerufen.
 */
async function loadRobots(origin: string): Promise<{ rules: string[]; allowAll: boolean }> {
  const cached = robotsCache.get(origin)
  if (cached) return cached

  let parsed: { rules: string[]; allowAll: boolean } = { rules: [], allowAll: true }
  try {
    const response = await rawFetch(`${origin}/robots.txt`)
    if (response.ok) {
      const text = (await response.text()).slice(0, 200_000)
      const rules: string[] = []
      let applies = false
      for (const line of text.split(/\r?\n/)) {
        const clean = line.split('#')[0].trim()
        if (!clean) continue
        const [rawKey, ...rest] = clean.split(':')
        const key = rawKey.trim().toLowerCase()
        const value = rest.join(':').trim()
        if (key === 'user-agent') {
          applies = value === '*' || value.toLowerCase().includes('jarvis')
        } else if (key === 'disallow' && applies && value) {
          rules.push(value)
        }
      }
      parsed = { rules, allowAll: rules.length === 0 }
    }
  } catch {
    // Keine robots.txt erreichbar: der übliche Fall bei kleinen Seiten.
    parsed = { rules: [], allowAll: true }
  }

  robotsCache.set(origin, parsed)
  return parsed
}

export async function isAllowed(url: string): Promise<boolean> {
  if (!getSettings().research.respectRobotsTxt) return true
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return false
  }
  const robots = await loadRobots(parsedUrl.origin)
  if (robots.allowAll) return true
  const path = parsedUrl.pathname + parsedUrl.search
  return !robots.rules.some((rule) => rule === '/' || path.startsWith(rule))
}

export class FetchBlockedError extends Error {
  constructor(readonly url: string) {
    super(`Die robots.txt von ${url} verbietet den Abruf dieser Seite.`)
    this.name = 'FetchBlockedError'
  }
}

export async function fetchPage(url: string, signal?: AbortSignal): Promise<FetchedPage> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Nur http/https werden abgerufen, nicht ${parsed.protocol}`)
  }

  if (!(await isAllowed(url))) throw new FetchBlockedError(url)

  await throttle(parsed.host)
  const response = await rawFetch(url, signal)
  const contentType = response.headers.get('content-type') ?? ''

  if (!response.ok) {
    throw new Error(`${url} antwortete mit HTTP ${response.status}`)
  }
  if (contentType && !/text\/html|application\/xhtml|text\/plain|application\/xml/i.test(contentType)) {
    throw new Error(`${url} liefert ${contentType} — dort steht kein lesbarer Text.`)
  }

  const buffer = await response.arrayBuffer()
  const sliced = buffer.byteLength > MAX_BYTES ? buffer.slice(0, MAX_BYTES) : buffer
  const html = new TextDecoder('utf-8', { fatal: false }).decode(sliced)

  return {
    url,
    finalUrl: response.url || url,
    status: response.status,
    html,
    contentHash: createHash('sha256').update(html).digest('hex'),
    fetchedAt: new Date().toISOString(),
    contentType
  }
}

/** Nur für Tests: Drosselung und robots-Zwischenspeicher leeren. */
export function resetFetcherState(): void {
  lastRequestByHost.clear()
  robotsCache.clear()
}
