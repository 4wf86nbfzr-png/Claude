import { z } from "zod";

/**
 * Validiertes Ergebnisschema der Anfrage-Extraktion. Fehlende Angaben bleiben null
 * und werden in missingFields benannt; Unklarheiten stehen in uncertainties.
 * Die KI darf nichts erfinden – die Geschäftslogik prüft das Ergebnis zusätzlich.
 */
export const requestExtractionSchema = z.object({
  title: z.string().nullable().describe("Kurzer Titel der Anfrage, aus dem Text abgeleitet"),
  startsAt: z.string().nullable().describe("Beginn als ISO-8601 mit Zeitzone, nur wenn im Text eindeutig"),
  endsAt: z.string().nullable().describe("Ende als ISO-8601 mit Zeitzone, nur wenn im Text eindeutig"),
  locationText: z.string().nullable().describe("Einsatzort wörtlich aus dem Text"),
  headcount: z.number().int().nullable().describe("Gesamtzahl benötigter Personen, nur wenn genannt"),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  requestedRoles: z.array(z.object({ name: z.string(), count: z.number().int().nullable(), qualifications: z.array(z.string()) })).describe("Gewünschte Rollen mit Anzahl, z. B. Einlass 4"),
  missingFields: z.array(z.enum(["startsAt", "endsAt", "locationText", "headcount", "contact"])).describe("Pflichtangaben, die im Text fehlen"),
  uncertainties: z.array(z.string()).describe("Widersprüchliche oder unklare Angaben in einem Satz je Punkt"),
  confidence: z.enum(["low", "medium", "high"]),
});
export type RequestExtraction = z.infer<typeof requestExtractionSchema>;

export const deviationExplanationSchema = z.object({
  summary: z.string().describe("Eine verständliche Erklärung der Abweichung in zwei bis drei Sätzen, deutsch"),
  likelyCauses: z.array(z.string()).max(4),
  recommendedAction: z.string(),
});
export type DeviationExplanation = z.infer<typeof deviationExplanationSchema>;

export const documentSummarySchema = z.object({
  summary: z.string().describe("Zusammenfassung in maximal fünf Sätzen, deutsch"),
  keyDates: z.array(z.object({ label: z.string(), date: z.string() })),
  openQuestions: z.array(z.string()),
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;
