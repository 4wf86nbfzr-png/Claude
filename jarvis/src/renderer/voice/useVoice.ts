import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceCapabilities {
  stt: string;
  tts: string;
  language: string;
  wakeWord: string;
}

export interface VoiceController {
  supported: boolean;
  listening: boolean;
  /** 0…1 microphone level, drives the orb. */
  level: number;
  partial: string;
  error: string | null;
  toggle(): void;
  stop(): void;
  speak(text: string): Promise<void>;
  stopSpeaking(): void;
  speaking: boolean;
  capabilities: VoiceCapabilities | null;
}

/**
 * Speech input and output in the renderer.
 *
 * Input: the browser's own recognition engine when `sttProvider` is
 * `webspeech`, otherwise the microphone is recorded and the audio is sent to
 * the main process, which calls the configured service. Output likewise uses
 * `speechSynthesis` locally or fetches audio through IPC.
 *
 * The wake word is matched here so a `jarvis …` sentence can be issued without
 * touching the keyboard; everything before the wake word is discarded.
 */
export function useVoice(onUtterance: (text: string) => void): VoiceController {
  const [capabilities, setCapabilities] = useState<VoiceCapabilities | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<number | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const utteranceHandler = useRef(onUtterance);
  utteranceHandler.current = onUtterance;

  useEffect(() => {
    void window.jarvis.voice.capabilities().then(setCapabilities);
  }, []);

  const supported =
    capabilities !== null &&
    capabilities.stt !== 'off' &&
    (capabilities.stt !== 'webspeech' ||
      typeof (window.SpeechRecognition ?? window.webkitSpeechRecognition) === 'function');

  /* ---------------- microphone level for the orb ---------------- */

  const startMeter = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const context = new AudioContext();
      audioContext.current = context;
      const source = context.createMediaStreamSource(media);
      const node = context.createAnalyser();
      node.fftSize = 512;
      source.connect(node);
      analyser.current = node;

      const data = new Uint8Array(node.frequencyBinCount);
      const tick = (): void => {
        node.getByteTimeDomainData(data);
        let peak = 0;
        for (const sample of data) {
          peak = Math.max(peak, Math.abs(sample - 128) / 128);
        }
        setLevel((previous) => previous * 0.7 + peak * 0.3);
        frame.current = requestAnimationFrame(tick);
      };
      tick();
      return media;
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === 'NotAllowedError'
          ? 'Kein Zugriff auf das Mikrofon. Bitte im Betriebssystem erlauben.'
          : 'Das Mikrofon konnte nicht geöffnet werden.',
      );
      return null;
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    analyser.current = null;
    void audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setLevel(0);
  }, []);

  /* ---------------- recognition ---------------- */

  const handleTranscript = useCallback((text: string) => {
    const wakeWord = capabilities?.wakeWord?.trim().toLowerCase();
    let utterance = text.trim();
    if (wakeWord) {
      const lower = utterance.toLowerCase();
      const index = lower.indexOf(wakeWord);
      if (index !== -1) utterance = utterance.slice(index + wakeWord.length).replace(/^[\s,.:!?-]+/, '');
    }
    if (utterance) utteranceHandler.current(utterance);
  }, [capabilities?.wakeWord]);

  const stop = useCallback(() => {
    recognition.current?.stop();
    recognition.current = null;
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    setListening(false);
    setPartial('');
    stopMeter();
  }, [stopMeter]);

  const startWebSpeech = useCallback(async () => {
    const Engine = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Engine) {
      setError('Dieses System bietet keine eingebaute Spracherkennung.');
      return;
    }
    const media = await startMeter();
    if (!media) return;

    const engine = new Engine();
    engine.lang = capabilities?.language ?? 'de-DE';
    engine.continuous = false;
    engine.interimResults = true;
    engine.maxAlternatives = 1;

    engine.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]!;
        const transcript = result[0].transcript;
        if (result.isFinal) {
          setPartial('');
          handleTranscript(transcript);
        } else {
          interim += transcript;
        }
      }
      if (interim) setPartial(interim);
    };
    engine.onerror = (event) => {
      if (event.error === 'no-speech') return;
      setError(
        event.error === 'not-allowed'
          ? 'Kein Zugriff auf das Mikrofon.'
          : `Spracherkennung: ${event.error}`,
      );
    };
    engine.onend = () => {
      setListening(false);
      stopMeter();
    };

    recognition.current = engine;
    setError(null);
    setListening(true);
    engine.start();
  }, [capabilities?.language, handleTranscript, startMeter, stopMeter]);

  const startRecording = useCallback(async () => {
    const media = await startMeter();
    if (!media) return;
    chunks.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const instance = new MediaRecorder(media, { mimeType });
    instance.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    instance.onstop = async () => {
      stopMeter();
      setListening(false);
      const blob = new Blob(chunks.current, { type: mimeType });
      if (blob.size < 1200) return;
      const buffer = await blob.arrayBuffer();
      const result = await window.jarvis.voice.transcribe(buffer, mimeType);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      handleTranscript(result.value);
    };
    recorder.current = instance;
    setError(null);
    setListening(true);
    instance.start();
  }, [handleTranscript, startMeter, stopMeter]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }
    if (capabilities?.stt === 'webspeech') void startWebSpeech();
    else if (capabilities?.stt === 'openai') void startRecording();
    else setError('Die Spracheingabe ist in den Einstellungen abgeschaltet.');
  }, [capabilities?.stt, listening, startRecording, startWebSpeech, stop]);

  /* ---------------- speech output ---------------- */

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (player.current) {
      player.current.pause();
      player.current = null;
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !capabilities || capabilities.tts === 'off') return;
      stopSpeaking();

      if (capabilities.tts === 'webspeech') {
        if (!window.speechSynthesis) {
          setError('Dieses System bietet keine eingebaute Sprachausgabe.');
          return;
        }
        const utterance = new SpeechSynthesisUtterance(trimmed);
        utterance.lang = capabilities.language;
        utterance.rate = 1.02;
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        setSpeaking(true);
        window.speechSynthesis.speak(utterance);
        return;
      }

      const audio = await window.jarvis.voice.synthesize(trimmed);
      if (!audio.ok) {
        setError(audio.error.message);
        return;
      }
      const blob = new Blob([audio.value.audio], { type: audio.value.mimeType });
      const element = new Audio(URL.createObjectURL(blob));
      element.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(element.src);
      };
      player.current = element;
      setSpeaking(true);
      await element.play().catch(() => setSpeaking(false));
    },
    [capabilities, stopSpeaking],
  );

  useEffect(() => () => {
    stop();
    stopSpeaking();
  }, [stop, stopSpeaking]);

  return {
    supported,
    listening,
    level,
    partial,
    error,
    toggle,
    stop,
    speak,
    stopSpeaking,
    speaking,
    capabilities,
  };
}
