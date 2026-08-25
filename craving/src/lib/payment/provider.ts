import { PAYMENT_METHODS } from "@/data/config";
import type { Cents, Fulfillment, PaymentMethod, PaymentMethodId } from "@/types/domain";

/**
 * Abstraktion der Zahlungsanbieter.
 *
 * Im Testbetrieb gibt es bewusst KEINE Schein-Zahlung. Online-Verfahren
 * melden `unavailable`; Bar- und Kartenzahlung vor Ort brauchen keine
 * Online-Abwicklung und melden `offline`.
 *
 * Spaetere Anbindung: eigene Implementierung von PaymentProvider
 * (z. B. stripe-provider.ts) registrieren — das UI bleibt unveraendert.
 */

export interface PaymentIntentRequest {
  amount: Cents;
  currency: "EUR";
  orderId: string;
  method: PaymentMethodId;
}

export type PaymentIntentResult =
  | { status: "offline"; note: string }
  | { status: "unavailable"; note: string }
  | { status: "requires_action"; clientSecret: string }
  | { status: "succeeded"; reference: string };

export interface PaymentProvider {
  id: string;
  supports(method: PaymentMethodId): boolean;
  createIntent(req: PaymentIntentRequest): Promise<PaymentIntentResult>;
}

const OFFLINE_METHODS: PaymentMethodId[] = ["cash_on_delivery", "card_on_delivery", "cash_on_pickup"];

/** Der einzige aktive Provider der Testphase. */
export const offlineProvider: PaymentProvider = {
  id: "offline",
  supports: (method) => OFFLINE_METHODS.includes(method),
  createIntent: async ({ method }) => ({
    status: "offline",
    note:
      method === "cash_on_pickup"
        ? "Bezahlt wird bei der Abholung im Laden."
        : "Bezahlt wird an der Tuer beim Fahrer.",
  }),
};

const providers: PaymentProvider[] = [offlineProvider];

export function registerProvider(provider: PaymentProvider): void {
  if (!providers.some((p) => p.id === provider.id)) providers.push(provider);
}

export function providerFor(method: PaymentMethodId): PaymentProvider | undefined {
  return providers.find((p) => p.supports(method));
}

export async function createPaymentIntent(req: PaymentIntentRequest): Promise<PaymentIntentResult> {
  const provider = providerFor(req.method);
  if (!provider) {
    return {
      status: "unavailable",
      note: "Dieses Zahlungsverfahren ist im Testbetrieb noch nicht angebunden.",
    };
  }
  return provider.createIntent(req);
}

export function paymentMethodsFor(fulfillment: Fulfillment): PaymentMethod[] {
  return PAYMENT_METHODS.filter((m) => !m.fulfillment || m.fulfillment.includes(fulfillment));
}
