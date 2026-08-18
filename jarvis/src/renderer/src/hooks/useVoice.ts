/**
 * Sprache im Fenster.
 *
 * Aufnahme über MediaRecorder, Pegel über einen AnalyserNode (der treibt den
 * Orb). Die Erkennung selbst passiert im Main-Prozess, damit kein Schlüssel
 * ins Fenster muss. Für die Ausgabe wird entweder geliefertes Audio abgespielt
 * oder die Systemstimme benutzt.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface VoiceController {
  recording: boolean
  level: number
  speaking: boolean
  error: string | null
  start(): Promise<void>
  stop(): Promise<string | null>
  toggle(): Promise<string | null>
  say(text: string): Promise<void>
  stopSpeaking(): void
}

export function useVoice(): VoiceController {
  const [recording, setRecording] = useState(false)
  const [level, setLevel] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const raf = useRef<number | null>(null)
  const player = useRef<HTMLAudioElement | null>(null)

  const teardown = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    void audioContext.current?.close().catch(() => undefined)
    audioContext.current = null
    setLevel(0)
  }, [])

  useEffect(() => teardown, [teardown])

  const start = useCallback(async () => {
    setError(null)
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      })
      stream.current = media
      chunks.current = []

      const context = new AudioContext()
      audioContext.current = context
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(media).connect(analyser)
      const buffer = new Uint8Array(analyser.frequencyBinCount)

      const tick = (): void => {
        analyser.getByteTimeDomainData(buffer)
        let sum = 0
        for (const value of buffer) {
          const centred = (value - 128) / 128
          sum += centred * centred
        }
        setLevel(Math.min(1, Math.sqrt(sum / buffer.length) * 3.4))
        raf.current = requestAnimationFrame(tick)
      }
      tick()

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''

      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data)
      }
      rec.start(250)
      recorder.current = rec
      setRecording(true)
    } catch (err) {
      teardown()
      setError(
        err instanceof Error
          ? `Das Mikrofon ließ sich nicht öffnen: ${err.message}`
          : 'Das Mikrofon ließ sich nicht öffnen.'
      )
    }
  }, [teardown])

  const stop = useCallback(async (): Promise<string | null> => {
    const rec = recorder.current
    if (!rec) return null

    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }))
      rec.stop()
    })

    recorder.current = null
    setRecording(false)
    teardown()

    if (blob.size < 1200) {
      setError('Die Aufnahme war zu kurz.')
      return null
    }

    const base64 = toBase64(new Uint8Array(await blob.arrayBuffer()))
    const result = await window.jarvis.voice.transcribe(base64, blob.type || 'audio/webm')
    if (!result.ok) {
      setError(result.error)
      return null
    }
    return result.data.text
  }, [teardown])

  const toggle = useCallback(async (): Promise<string | null> => {
    if (recording) return stop()
    await start()
    return null
  }, [recording, start, stop])

  const stopSpeaking = useCallback(() => {
    player.current?.pause()
    player.current = null
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  const say = useCallback(
    async (text: string) => {
      const clean = text.trim()
      if (!clean) return
      stopSpeaking()

      const result = await window.jarvis.voice.speak(clean)
      if (!result.ok) {
        // Die Stimme ist Beiwerk: fällt der Dienst aus, wird die Systemstimme
        // genommen, statt den Nutzer mit einer Fehlermeldung zu behelligen.
        speakWithSystemVoice(clean, setSpeaking)
        return
      }

      if (!result.data.audioBase64) {
        speakWithSystemVoice(clean, setSpeaking)
        return
      }

      const audio = new Audio(`data:${result.data.mimeType ?? 'audio/mpeg'};base64,${result.data.audioBase64}`)
      player.current = audio
      setSpeaking(true)
      audio.onended = () => setSpeaking(false)
      audio.onerror = () => {
        setSpeaking(false)
        speakWithSystemVoice(clean, setSpeaking)
      }
      try {
        await audio.play()
      } catch {
        setSpeaking(false)
      }
    },
    [stopSpeaking]
  )

  return { recording, level, speaking, error, start, stop, toggle, say, stopSpeaking }
}

/**
 * Wandelt die Aufnahme in base64.
 * In Stücken, weil `String.fromCharCode(...bytes)` bei längeren Aufnahmen
 * den Aufrufstapel sprengt.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return btoa(binary)
}

function speakWithSystemVoice(text: string, setSpeaking: (value: boolean) => void): void {
  if (!('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'de-DE'
  utterance.onend = () => setSpeaking(false)
  utterance.onerror = () => setSpeaking(false)
  setSpeaking(true)
  window.speechSynthesis.speak(utterance)
}
