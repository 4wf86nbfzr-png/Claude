/**
 * Schlanke Metrik-Registry. Zaehler, Gauges und Histogramme mit festen
 * Quantilen - genug fuer die geforderten Latenz- und Betriebskennzahlen,
 * ohne Prometheus-Client als Abhaengigkeit.
 */
export type Labels = Readonly<Record<string, string>>;

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k] ?? ''}`).join(',');
}

export class Counter {
  private readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  inc(labels: Labels = {}, by = 1): void {
    const k = labelKey(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
  get(labels: Labels = {}): number {
    return this.values.get(labelKey(labels)) ?? 0;
  }
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.values);
  }
}

export class Gauge {
  private readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  set(value: number, labels: Labels = {}): void {
    this.values.set(labelKey(labels), value);
  }
  get(labels: Labels = {}): number {
    return this.values.get(labelKey(labels)) ?? 0;
  }
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.values);
  }
}

export interface HistogramSummary {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
}

export class Histogram {
  private readonly samples = new Map<string, number[]>();
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly maxSamples = 2000,
  ) {}

  observe(value: number, labels: Labels = {}): void {
    const k = labelKey(labels);
    let arr = this.samples.get(k);
    if (arr === undefined) {
      arr = [];
      this.samples.set(k, arr);
    }
    arr.push(value);
    if (arr.length > this.maxSamples) arr.shift();
  }

  summary(labels: Labels = {}): HistogramSummary | null {
    const arr = this.samples.get(labelKey(labels));
    if (arr === undefined || arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const q = (p: number): number => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
    const sum = s.reduce((a, b) => a + b, 0);
    return {
      count: s.length,
      min: s[0] ?? 0,
      max: s[s.length - 1] ?? 0,
      mean: sum / s.length,
      p50: q(50),
      p90: q(90),
      p95: q(95),
      p99: q(99),
    };
  }

  snapshot(): Record<string, HistogramSummary | null> {
    return Object.fromEntries([...this.samples.keys()].map((k) => [k, this.summaryByKey(k)]));
  }

  private summaryByKey(k: string): HistogramSummary | null {
    const arr = this.samples.get(k);
    if (arr === undefined || arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const q = (p: number): number => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
    const sum = s.reduce((a, b) => a + b, 0);
    return {
      count: s.length,
      min: s[0] ?? 0,
      max: s[s.length - 1] ?? 0,
      mean: sum / s.length,
      p50: q(50),
      p90: q(90),
      p95: q(95),
      p99: q(99),
    };
  }
}

/** Die konkreten Kennzahlen aus der Anforderung. */
export const metrics = {
  openEvents: new Gauge('jarvis_open_events', 'Offene, noch nicht besprochene Ereignisse'),
  pendingCallJobs: new Gauge('jarvis_pending_call_jobs', 'Wartende Anruf-Jobs'),
  callsFailed: new Counter('jarvis_calls_failed_total', 'Fehlgeschlagene Anrufe'),
  callsPlaced: new Counter('jarvis_calls_placed_total', 'Gestartete ausgehende Anrufe'),
  callsReceived: new Counter('jarvis_calls_received_total', 'Angenommene eingehende Anrufe'),
  callDurationMs: new Histogram('jarvis_call_duration_ms', 'Gespraechsdauer'),
  sttLatencyMs: new Histogram('jarvis_stt_latency_ms', 'VAD-Ende bis finales Transkript'),
  modelTtftMs: new Histogram('jarvis_model_ttft_ms', 'Modell: Zeit bis zum ersten Token'),
  ttsTtfaMs: new Histogram('jarvis_tts_ttfa_ms', 'TTS: Zeit bis zum ersten Audio'),
  turnLatencyMs: new Histogram('jarvis_turn_latency_ms', 'Gesamtlatenz bis Antwortbeginn'),
  providerErrors: new Counter('jarvis_provider_errors_total', 'Providerfehler'),
  oauthRenewFailures: new Counter('jarvis_oauth_renew_failures_total', 'Fehlgeschlagene OAuth-Erneuerungen'),
  duplicatesDropped: new Counter('jarvis_duplicates_dropped_total', 'Verworfene Duplikate'),
  approvalsRequested: new Counter('jarvis_approvals_requested_total', 'Angeforderte Versandfreigaben'),
  approvalsExpired: new Counter('jarvis_approvals_expired_total', 'Abgelaufene Freigaben'),
  approvalsGranted: new Counter('jarvis_approvals_granted_total', 'Erteilte Freigaben'),
  sendsExecuted: new Counter('jarvis_sends_executed_total', 'Tatsaechlich ausgefuehrte Sendungen'),
  injectionsDetected: new Counter('jarvis_injections_detected_total', 'Erkannte Injection-Muster'),
} as const;

export function metricsSnapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, m] of Object.entries(metrics)) {
    out[key] = m.snapshot();
  }
  return out;
}

/** Setzt alle Metriken zurueck - nur fuer Tests. */
export function resetMetrics(): void {
  for (const m of Object.values(metrics)) {
    const anyM = m as unknown as { values?: Map<string, unknown>; samples?: Map<string, unknown> };
    anyM.values?.clear();
    anyM.samples?.clear();
  }
}
