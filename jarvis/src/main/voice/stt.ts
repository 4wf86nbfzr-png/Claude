/**
 * Spracherkennung.
 *
 * Die Aufnahme entsteht im Fenster (MediaRecorder) und kommt als base64 hier
 * an. Der Anbieter ist austauschbar; "browser" bedeutet, dass die Erkennung
 * im Fenster selbst läuft und dieser Weg gar nicht benutzt wird.
 */
import { getSecret } from '../services/credentials'
import { getSettings } from '../services/settings'
import type { ToolResult } from '@shared/types'

export interface Transcription {
  text: string
  provider: string
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  return 'webm'
}

async function openAiTranscribe(audio: Buffer, mimeType: string): Promise<Transcription> {
  const key = getSecret('OPENAI_API_KEY')
  if (!key) throw new Error('Für die Spracherkennung ist kein OPENAI_API_KEY hinterlegt.')

  const settings = getSettings()
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `aufnahme.${extensionFor(mimeType)}`)
  form.append('model', settings.stt.model || 'whisper-1')
  if (settings.stt.language) form.append('language', settings.stt.language)

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Die Spracherkennung antwortete mit HTTP ${response.status}: ${detail.slice(0, 300)}`)
  }

  const data = (await response.json()) as { text?: string }
  return { text: (data.text ?? '').trim(), provider: 'openai' }
}

async function deepgramTranscribe(audio: Buffer, mimeType: string): Promise<Transcription> {
  const key = getSecret('DEEPGRAM_API_KEY')
  if (!key) throw new Error('Für Deepgram ist kein DEEPGRAM_API_KEY hinterlegt.')

  const settings = getSettings()
  const url = new URL('https://api.deepgram.com/v1/listen')
  url.searchParams.set('model', settings.stt.model || 'nova-2')
  url.searchParams.set('language', settings.stt.language || 'de')
  url.searchParams.set('smart_format', 'true')

  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Token ${key}`, 'content-type': mimeType },
    body: new Uint8Array(audio)
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Deepgram antwortete mit HTTP ${response.status}: ${detail.slice(0, 300)}`)
  }

  const data = (await response.json()) as {
    results?: { channels?: { alternatives?: { transcript?: string }[] }[] }
  }
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
  return { text: text.trim(), provider: 'deepgram' }
}

export async function transcribe(audioBase64: string, mimeType: string): Promise<ToolResult<Transcription>> {
  const settings = getSettings()

  if (settings.stt.provider === 'browser') {
    return {
      ok: false,
      error: 'Die Spracherkennung ist auf "browser" gestellt und läuft im Fenster.',
      hint: 'Dieser Aufruf wird dann nicht gebraucht.'
    }
  }

  let audio: Buffer
  try {
    audio = Buffer.from(audioBase64, 'base64')
  } catch {
    return { ok: false, error: 'Die Aufnahme kam beschädigt an.' }
  }
  if (audio.byteLength < 1000) {
    return { ok: false, error: 'Die Aufnahme ist zu kurz — es war nichts zu hören.' }
  }
  if (audio.byteLength > 25_000_000) {
    return { ok: false, error: 'Die Aufnahme ist größer als 25 MB und wird von den Diensten abgelehnt.' }
  }

  try {
    const result =
      settings.stt.provider === 'deepgram'
        ? await deepgramTranscribe(audio, mimeType)
        : await openAiTranscribe(audio, mimeType)

    if (!result.text) return { ok: false, error: 'Es war nichts Verständliches zu hören.' }
    return { ok: true, data: result, note: result.text }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
