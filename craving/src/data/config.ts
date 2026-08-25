import type {
  Coupon, DeliveryZone, OpeningHours, PaymentMethod,
} from "@/types/domain";

/**
 * Zentrale Betriebs-Konfiguration.
 *
 * ACHTUNG: Firmendaten sind bewusst PLATZHALTER. Es sind keine erfundenen
 * Handelsregister-, Steuer- oder Adressdaten hinterlegt — vor dem Live-Gang
 * ersetzen (siehe docs/GO-LIVE.md).
 */

export const PLACEHOLDER = "[bitte ergaenzen]";

export const BRAND = {
  name: "CRAVING",
  wordmark: "CRAVING",
  claim: "Build your craving.",
  subline: "Doener. Pizza. Croque. Exactly how you want it.",
  /** Wird in Metadaten, Footer und strukturierten Daten verwendet. */
  legalName: PLACEHOLDER,
  street: PLACEHOLDER,
  postalCode: PLACEHOLDER,
  city: PLACEHOLDER,
  country: "DE",
  phone: PLACEHOLDER,
  email: PLACEHOLDER,
  vatId: PLACEHOLDER,
  register: PLACEHOLDER,
  managingDirector: PLACEHOLDER,
  supervisoryAuthority: PLACEHOLDER,
  hoster: PLACEHOLDER,
  /** Fuer OpenGraph/Canonical. In Produktion per ENV setzen. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://craving.example",
  instagram: PLACEHOLDER,
} as const;

/** Testbetrieb: keine echten Bestellungen, kein echter Zahlungsverkehr. */
export const DEMO_MODE = true;

export const CURRENCY = "EUR";
export const LOCALE = "de-DE";

/* ------------------------------------------------------------------ *
 * Oeffnungszeiten (lokale Zeit des Betriebs)
 * ------------------------------------------------------------------ */

export const OPENING_HOURS: OpeningHours = {
  1: [{ from: "11:00", to: "23:00" }], // Mo
  2: [{ from: "11:00", to: "23:00" }],
  3: [{ from: "11:00", to: "23:00" }],
  4: [{ from: "11:00", to: "23:00" }],
  5: [{ from: "11:00", to: "01:00" }], // Fr, ueber Mitternacht
  6: [{ from: "11:00", to: "01:00" }], // Sa
  0: [{ from: "12:00", to: "23:00" }], // So
};

/** Ausnahmen: ISO-Datum -> Zeiten (leer = geschlossen). */
export const OPENING_EXCEPTIONS: Record<string, { from: string; to: string }[]> = {
  "2026-12-24": [],
  "2026-12-25": [{ from: "16:00", to: "22:00" }],
};

/** Vorbestellung im geschlossenen Zustand erlauben. */
export const PREORDER_ENABLED = true;

/* ------------------------------------------------------------------ *
 * Liefergebiete
 * ------------------------------------------------------------------ */

export const DELIVERY_ZONES: DeliveryZone[] = [
  {
    id: "zone-a",
    label: "Zone A — direkte Nachbarschaft",
    postalCodes: ["20095", "20097", "20099", "20144", "20146"],
    minOrder: 1200,
    fee: 190,
    freeFrom: 2500,
    etaMinutes: 30,
  },
  {
    id: "zone-b",
    label: "Zone B — erweitertes Gebiet",
    postalCodes: ["20249", "20251", "20255", "20357", "20359", "22083", "22087"],
    minOrder: 1800,
    fee: 290,
    freeFrom: 3500,
    etaMinutes: 45,
  },
  {
    id: "zone-c",
    label: "Zone C — Randlage",
    postalCodes: ["22303", "22305", "22307", "22523", "22525"],
    minOrder: 2500,
    fee: 390,
    etaMinutes: 60,
  },
];

export const PICKUP_ETA_MINUTES = 15;

/* ------------------------------------------------------------------ *
 * Zahlung
 * ------------------------------------------------------------------ */

/**
 * Im Testbetrieb sind die Online-Verfahren sichtbar, aber deaktiviert.
 * Es gibt bewusst KEINE Schein-Zahlung. Die Anbindung erfolgt spaeter
 * ueber lib/payment/provider.ts (Stripe/PayPal).
 */
export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "apple_pay", label: "Apple Pay", hint: "Kommt mit der Stripe-Anbindung.", enabled: false },
  { id: "google_pay", label: "Google Pay", hint: "Kommt mit der Stripe-Anbindung.", enabled: false },
  { id: "paypal", label: "PayPal", hint: "Kommt mit der PayPal-Anbindung.", enabled: false },
  { id: "card", label: "Kreditkarte", hint: "Kommt mit der Stripe-Anbindung.", enabled: false },
  { id: "card_on_delivery", label: "EC-Karte bei Lieferung", hint: "Fahrer bringt das Geraet mit.", fulfillment: ["delivery"], enabled: true },
  { id: "cash_on_delivery", label: "Bar bei Lieferung", fulfillment: ["delivery"], enabled: true },
  { id: "cash_on_pickup", label: "Bar bei Abholung", fulfillment: ["pickup"], enabled: true },
];

/* ------------------------------------------------------------------ *
 * Trinkgeld & Gutscheine
 * ------------------------------------------------------------------ */

export const TIP_PRESETS = [0, 5, 10] as const;

export const COUPONS: Coupon[] = [
  { code: "CRAVING10", label: "10 % auf alles", kind: "percent", value: 10, minSubtotal: 1500, active: true },
  { code: "FREIFAHRT", label: "Lieferung geschenkt", kind: "free_delivery", value: 0, minSubtotal: 2000, active: true },
  { code: "MOIN5", label: "5 EUR Rabatt", kind: "fixed", value: 500, minSubtotal: 2500, active: true },
];

/* ------------------------------------------------------------------ *
 * Bestellstatus (Anzeige + Demo-Timing der Tracking-Seite)
 * ------------------------------------------------------------------ */

export const ORDER_STATUS_FLOW = [
  { id: "received", label: "Bestellung erhalten", note: "Wir haben sie. Kueche ist informiert.", afterMinutes: 0 },
  { id: "preparing", label: "Wird vorbereitet", note: "Zutaten kommen aufs Brett.", afterMinutes: 3 },
  { id: "cooking", label: "Im Ofen / auf dem Grill", note: "Jetzt wird es heiss.", afterMinutes: 9 },
  { id: "on_the_way", label: "Fahrer unterwegs", note: "Raus aus dem Laden.", afterMinutes: 18 },
  { id: "nearby", label: "Gleich da", note: "Weniger als fuenf Minuten.", afterMinutes: 28 },
  { id: "delivered", label: "Geliefert", note: "Guten Appetit.", afterMinutes: 33 },
] as const;
