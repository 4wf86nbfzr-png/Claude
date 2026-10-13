"use client";

import { Alert } from "@/components/ui";
import { usePublicConfig } from "@/lib/public-config";

/** Ehrlicher Hinweis, solange die Abrechnung (Stripe) nicht freigeschaltet ist. */
export function BillingNote() {
  const cfg = usePublicConfig();
  if (!cfg) return null;
  return (
    <div className="mt-5 max-w-2xl">
      {cfg.stripe_ready ? (
        <p className="text-sm text-muted">{PLAN_TRIAL(cfg.trial_days)}</p>
      ) : (
        <Alert tone="warn">{PLAN_TRIAL(cfg.trial_days)} Die Bezahlung per Karte oder Lastschrift ist noch nicht freigeschaltet: Ein Tarif lässt sich derzeit nicht buchen, es wird nichts berechnet. Ihr Wunschtarif wird bei der Registrierung vorgemerkt.</Alert>
      )}
    </div>
  );
}

const PLAN_TRIAL = (days: number) => `${days} Tage kostenlos testen, ohne Zahlungsdaten.`;
