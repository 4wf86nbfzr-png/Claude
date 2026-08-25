/**
 * Dezente Bedien-Toene.
 *
 * Bewusst ohne Audiodateien: zwei kurze Sinus-Impulse aus der WebAudio-API
 * kosten kein Byte Ladezeit und klingen in jedem Browser gleich. Standard
 * ist AUS — der Ton laeuft erst, wenn er im Konto eingeschaltet wurde, und
 * immer nur als Folge einer Nutzeraktion (Autoplay-Regeln).
 */

let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

type Tone = "tick" | "add" | "done";

const TONES: Record<Tone, { freq: number; duration: number; gain: number; sweep?: number }> = {
  tick: { freq: 660, duration: 0.05, gain: 0.05 },
  add: { freq: 520, duration: 0.12, gain: 0.07, sweep: 880 },
  done: { freq: 440, duration: 0.24, gain: 0.08, sweep: 660 },
};

export function playTone(tone: Tone, enabled: boolean): void {
  if (!enabled) return;
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const { freq, duration, gain, sweep } = TONES[tone];
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(sweep, ctx.currentTime + duration);

  amp.gain.setValueAtTime(0.0001, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  osc.connect(amp).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.02);
}
