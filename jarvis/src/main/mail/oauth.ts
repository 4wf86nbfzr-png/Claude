/**
 * OAuth-Anmeldung für Gmail (Desktop-Flow mit PKCE).
 *
 * Ablauf: JARVIS startet kurz einen lokalen Server auf 127.0.0.1, öffnet den
 * Browser, fängt die Weiterleitung ab und tauscht den Code gegen Tokens. Das
 * Passwort des Postfachs sieht JARVIS dabei nie — genau darum OAuth statt
 * gespeichertem Kennwort.
 */
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'

export interface OAuthTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
  scope: string
  email: string | null
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
]

function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Oeffnet die URL im Standardbrowser — in Electron über shell, sonst über das Betriebssystem. */
async function openInBrowser(url: string): Promise<void> {
  try {
    const require = createRequire(import.meta.url)
    const electron = require('electron') as { shell?: { openExternal(url: string): Promise<void> } }
    if (electron?.shell?.openExternal) {
      await electron.shell.openExternal(url)
      return
    }
  } catch {
    /* Kein Electron — unten weiter. */
  }
  const { spawn } = await import('node:child_process')
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
}

const SUCCESS_PAGE = `<!doctype html><meta charset="utf-8"><title>JARVIS</title>
<body style="background:#08080A;color:#F6F6F8;font:16px/1.6 system-ui;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><p style="letter-spacing:.3em;font-size:12px;color:#8B8B93">JARVIS</p>
<h1 style="font-weight:500">Anmeldung abgeschlossen</h1>
<p style="color:#C7C7CD">Sie können dieses Fenster schließen.</p></div>`

/**
 * Führt die Anmeldung durch. Gibt Tokens zurück; der Aufrufer speichert das
 * Refresh-Token im verschlüsselten Zugangsspeicher.
 */
export async function runGoogleOAuth(input: {
  clientId: string
  clientSecret: string
  port: number
  timeoutMs?: number
}): Promise<OAuthTokens> {
  const verifier = base64Url(randomBytes(48))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  const state = base64Url(randomBytes(16))
  const redirectUri = `http://127.0.0.1:${input.port}/oauth/callback`

  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        server.close()
        reject(new Error('Die Anmeldung wurde nicht innerhalb von fünf Minuten abgeschlossen.'))
      },
      input.timeoutMs ?? 5 * 60 * 1000
    )

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${input.port}`)
      if (url.pathname !== '/oauth/callback') {
        res.writeHead(404).end()
        return
      }

      const error = url.searchParams.get('error')
      const returnedState = url.searchParams.get('state')
      const returnedCode = url.searchParams.get('code')

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(SUCCESS_PAGE)
      clearTimeout(timeout)
      server.close()

      if (error) {
        reject(new Error(`Google hat die Anmeldung abgelehnt: ${error}`))
      } else if (returnedState !== state) {
        reject(new Error('Der Rückgabewert "state" passt nicht — die Anmeldung wurde abgebrochen.'))
      } else if (!returnedCode) {
        reject(new Error('Google hat keinen Anmeldecode zurückgegeben.'))
      } else {
        resolve(returnedCode)
      }
    })

    server.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Der lokale Anmeldeserver auf Port ${input.port} ließ sich nicht starten: ${err.message}`))
    })

    server.listen(input.port, '127.0.0.1', () => {
      const authUrl = new URL(AUTH_ENDPOINT)
      authUrl.searchParams.set('client_id', input.clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', GMAIL_SCOPES.join(' '))
      authUrl.searchParams.set('code_challenge', challenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('access_type', 'offline')
      // Ohne "consent" liefert Google beim zweiten Mal kein Refresh-Token mehr.
      authUrl.searchParams.set('prompt', 'consent')
      void openInBrowser(authUrl.toString())
    })
  })

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    }).toString()
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Der Tausch des Anmeldecodes schlug fehl (HTTP ${response.status}): ${detail.slice(0, 400)}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    id_token?: string
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    email: readEmailFromIdToken(data.id_token)
  }
}

/** Liest die Adresse aus dem ID-Token. Nur Anzeige — keine Sicherheitsentscheidung. */
function readEmailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null
  const payload = idToken.split('.')[1]
  if (!payload) return null
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as {
      email?: string
    }
    return json.email ?? null
  } catch {
    return null
  }
}

/** Holt mit dem Refresh-Token ein frisches Zugriffstoken. */
export async function refreshGoogleAccessToken(input: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Das Zugriffstoken ließ sich nicht erneuern (HTTP ${response.status}): ${detail.slice(0, 300)}. ` +
        'Möglicherweise wurde der Zugriff bei Google widerrufen — dann hilft eine erneute Anmeldung.'
    )
  }

  const data = (await response.json()) as { access_token: string; expires_in: number }
  return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
}
