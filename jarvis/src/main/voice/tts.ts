/**
 * Sprachausgabe.
 *
 * Gibt Audio als base64 zurück; das Fenster spielt es ab. Steht der Anbieter
 * auf "browser", kommt kein Audio, sondern der Hinweis, dass die eingebaute
 * Stimme des Systems verwendet werden soll — das funktioniert ohne Schlüssel
 * und ohne dass Text das Gerät verlässt.
 */
import { getSecret } from '../services/credentials'
import { getSettings } from '../services/settings'
import type { ToolResult } from '@shared/types'

export interface Speech {
  audioBase64: string | null
  mimeType: string | null
  provider: string
}

const MAX_CHARS = 4000

async function openAiSpeak(text: string): Promise<Speech> {
  const key = getSecret('OPENAI_API_KEY')
  if (!key) throw new Error('Für die Sprachausgabe ist kein OPENAI_API_KEY hinterlegt.')

  const settings = getSettings()
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: settings.tts.voice || 'alloy',
      input: text,
      response_format: 'mp3'
    })
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Die Sprachausgabe antwortete mit HTTP ${response.status}: ${detail.slice(0, 300)}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  return { audioBase64: buffer.toString('base64'), mimeType: 'audio/mpeg', provider: 'openai' }
}

async function elevenLabsSpeak(text: string): Promise<Speech> {
  const key = getSecret('ELEVENLABS_API_KEY')
  if (!key) throw new Error('Für ElevenLabs ist kein ELEVENLABS_API_KEY hinterlegt.')

  const voice = getSettings().tts.voice || '21m00Tcm4TlvDq8ikWAM'
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': key, accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' })
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`ElevenLabs antwortete mit HTTP ${response.status}: ${detail.slice(0, 300)}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  return { audioBase64: buffer.toString('base64'), mimeType: 'audio/mpeg', provider: 'elevenlabs' }
}

export async function speak(text: string): Promise<ToolResult<Speech>> {
  const settings = getSettings()
  if (!settings.tts.enabled) {
    return { ok: false, error: 'Die Sprachausgabe ist ausgeschaltet.' }
  }

  const clean = text.trim().slice(0, MAX_CHARS)
  if (!clean) return { ok: false, error: 'Es gibt nichts vorzulesen.' }

  if (settings.tts.provider === 'browser') {
    return {
      ok: true,
      data: { audioBase64: null, mimeType: null, provider: 'browser' },
      note: 'Es wird die Systemstimme im Fenster verwendet.'
    }
  }

  try {
    const speech = settings.tts.provider === 'elevenlabs' ? await elevenLabsSpeak(clean) : await openAiSpeak(clean)
    return { ok: true, data: speech }
  } catch (err) {
    // Die Stimme ist Beiwerk — fällt sie aus, geht die Arbeit trotzdem weiter.
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      hint: 'In den Einstellungen lässt sich die Sprachausgabe auf "browser" (Systemstimme) umstellen.'
    }
  }
}
