/**
 * Einzige Quelle für Tarifdaten im Frontend (Startseite, /preise, strukturierte Daten, Registrierung).
 * Die Werte müssen mit `backend/app/services/features.py` (DEFAULT_PLANS) übereinstimmen;
 * `test-all.sh` vergleicht sie mit `GET /api/billing/plans`.
 */
export type PlanCode = "starter" | "business" | "pro";

export type Plan = {
  code: PlanCode;
  name: string;
  priceEur: number;
  priceCents: number;
  for: string;
  inquiriesPerMonth: number;
  users: number;
  /** Feature-Schlüssel wie im Backend (entitlements). */
  features: string[];
  /** Kurze Punkte für die Preiskarte. */
  highlights: string[];
  hot?: boolean;
};

export const PLANS: Plan[] = [
  {
    code: "starter",
    name: "Starter",
    priceEur: 79,
    priceCents: 7900,
    for: "Einzelbetriebe und kleine Teams",
    inquiriesPerMonth: 150,
    users: 2,
    features: ["inquiries", "ai_drafts", "customers", "reports_basic"],
    highlights: ["150 Anfragen im Monat", "Antwortentwürfe der KI mit Freigabe", "Kundenübersicht", "Standardberichte", "2 Nutzer"],
  },
  {
    code: "business",
    name: "Business",
    priceEur: 149,
    priceCents: 14900,
    for: "Betriebe mit Büro und Monteuren",
    inquiriesPerMonth: 500,
    users: 5,
    hot: true,
    features: ["inquiries", "ai_drafts", "customers", "reports_basic", "automations", "appointments", "quote_followup", "workflows"],
    highlights: ["500 Anfragen im Monat", "Automatische Eingangsbestätigung", "Terminvorschläge und Kalender", "Angebote nachverfolgen", "Individuelle Abläufe", "5 Nutzer"],
  },
  {
    code: "pro",
    name: "Pro",
    priceEur: 249,
    priceCents: 24900,
    for: "Wachsende Betriebe mit eigenen Systemen",
    inquiriesPerMonth: 2000,
    users: 15,
    features: ["inquiries", "ai_drafts", "customers", "reports_basic", "automations", "appointments", "quote_followup", "workflows", "integrations_advanced", "rules_custom", "reports_advanced", "priority_support"],
    highlights: ["2.000 Anfragen im Monat", "Webhooks für Ihr CRM und erweiterte Integrationen", "Eigene Automatisierungsregeln", "Umfangreiche Auswertungen", "Priorisierter Support", "15 Nutzer"],
  },
];

export const planByCode = (code: string | null | undefined): Plan | undefined => PLANS.find((p) => p.code === code);

/** Zeilen der Tarifvergleichstabelle: Beschriftung + Feature-Schlüssel (true/false je Tarif) oder Text je Tarif. */
export type CompareRow = { label: string; feature?: string; values?: [string, string, string]; note?: string };

export const COMPARE_ROWS: CompareRow[] = [
  { label: "Anfragen im Monat", values: ["150", "500", "2.000"], note: "Darüber hinaus werden Anfragen weiter erfasst, aber ohne Entwurf. Kein automatischer Aufpreis." },
  { label: "Nutzerkonten", values: ["2", "5", "15"] },
  { label: "KI-Kontingent inklusive", values: ["Ja", "Ja", "Ja"], note: "Bemessen für den jeweiligen Anfrageumfang. Ist es erreicht, informiert Clairify; es entstehen keine Zusatzkosten." },
  { label: "Anfragen erfassen, sortieren, priorisieren", feature: "inquiries" },
  { label: "Antwortentwürfe der KI mit Freigabe", feature: "ai_drafts" },
  { label: "Kundenübersicht", feature: "customers" },
  { label: "Standardberichte (Wochenbericht)", feature: "reports_basic" },
  { label: "Automatische Eingangsbestätigung für saubere Fälle", feature: "automations" },
  { label: "Terminvorschläge, Kalender, Google Kalender", feature: "appointments" },
  { label: "Offene Angebote nachfassen", feature: "quote_followup" },
  { label: "Individuelle Abläufe", feature: "workflows" },
  { label: "Webhooks und erweiterte Integrationen", feature: "integrations_advanced" },
  { label: "Eigene Automatisierungsregeln", feature: "rules_custom" },
  { label: "Umfangreiche Auswertungen", feature: "reports_advanced" },
  { label: "Priorisierter Support", feature: "priority_support" },
];

/** Allgemeine Bedingungen, an einer Stelle gepflegt. */
export const PLAN_TERMS = {
  vat: "Alle Preise zuzüglich Umsatzsteuer.",
  cancel: "Monatlich kündbar zum Ende des Abrechnungsmonats, im Kundenportal.",
  extra: "Keine Einrichtungsgebühr, keine Zusatzkosten für die KI.",
  intro: "Einführungspreise: Was Sie heute buchen, bleibt für Ihre Laufzeit so.",
  trial: (days: number) => `${days} Tage kostenlos testen, ohne Zahlungsdaten. Die Testphase umfasst Anfragen, Entwürfe, Termine und Angebotsnachverfolgung: 30 Anfragen, 1 Nutzer, begrenztes KI-Kontingent.`,
};
