import type { Qualification, ServiceCategory } from './types';

/**
 * Leistungskategorien.
 *
 * `requiresLicensedProfessional` ist die wichtigste Eigenschaft: Anfragen aus
 * diesen Kategorien duerfen ausschliesslich Personen angezeigt werden, deren
 * Fachqualifikation geprueft und gueltig ist (siehe matching/eligibility.ts).
 */
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    key: 'begleitung_termine',
    label: 'Begleitung zu Terminen',
    easyLabel: 'Jemand geht mit Ihnen zu einem Termin. Zum Beispiel zum Amt oder zur Ärztin.',
    icon: 'calendar-account',
    requiresLicensedProfessional: false,
  },
  {
    key: 'einkaufen',
    label: 'Einkaufen',
    easyLabel: 'Jemand kauft mit Ihnen ein. Oder kauft für Sie ein.',
    icon: 'cart',
    requiresLicensedProfessional: false,
  },
  {
    key: 'freizeit_teilhabe',
    label: 'Freizeit und Teilhabe',
    easyLabel: 'Jemand geht mit Ihnen ins Kino, ins Café oder zu einem Verein.',
    icon: 'ticket',
    requiresLicensedProfessional: false,
  },
  {
    key: 'spaziergang',
    label: 'Spaziergänge',
    easyLabel: 'Jemand geht mit Ihnen an die frische Luft.',
    icon: 'walk',
    requiresLicensedProfessional: false,
  },
  {
    key: 'vorlesen',
    label: 'Vorlesen',
    easyLabel: 'Jemand liest Ihnen etwas vor. Zum Beispiel Post oder ein Buch.',
    icon: 'book-open',
    requiresLicensedProfessional: false,
  },
  {
    key: 'haushaltshilfe',
    label: 'Haushaltshilfe',
    easyLabel: 'Jemand hilft Ihnen zu Hause. Zum Beispiel beim Aufräumen.',
    icon: 'home-heart',
    requiresLicensedProfessional: false,
  },
  {
    key: 'technische_hilfe',
    label: 'Technische Hilfe',
    easyLabel: 'Jemand hilft Ihnen mit Handy, Computer oder Fernseher.',
    icon: 'cellphone-cog',
    requiresLicensedProfessional: false,
  },
  {
    key: 'kommunikation',
    label: 'Hilfe beim Verstehen und Sprechen',
    easyLabel: 'Jemand hilft Ihnen, Briefe zu verstehen oder etwas zu sagen.',
    icon: 'message-text',
    requiresLicensedProfessional: false,
  },
  {
    key: 'fahrbegleitung',
    label: 'Fahrbegleitung',
    easyLabel: 'Jemand fährt mit Ihnen im Bus, in der Bahn oder im Auto mit.',
    icon: 'bus-clock',
    requiresLicensedProfessional: false,
  },
  {
    key: 'alltagshilfe',
    label: 'Weitere Alltagshilfe',
    easyLabel: 'Jemand hilft Ihnen bei etwas anderem im Alltag.',
    icon: 'hand-heart',
    requiresLicensedProfessional: false,
  },
  {
    key: 'pflegerische_unterstuetzung',
    label: 'Pflegerische Unterstützung',
    easyLabel:
      'Jemand hilft Ihnen bei der Körper-Pflege. Das darf nur eine ausgebildete Fachkraft machen.',
    icon: 'medical-bag',
    requiresLicensedProfessional: true,
  },
  {
    key: 'medizinische_unterstuetzung',
    label: 'Medizinnahe Unterstützung',
    easyLabel:
      'Jemand hilft Ihnen mit Medikamenten oder Hilfsmitteln. Das darf nur eine ausgebildete Fachkraft machen.',
    icon: 'pill',
    requiresLicensedProfessional: true,
  },
];

const CATEGORY_INDEX = new Map(SERVICE_CATEGORIES.map((c) => [c.key, c]));

export function getCategory(key: string): ServiceCategory | undefined {
  return CATEGORY_INDEX.get(key);
}

export function categoriesRequireProfessional(keys: readonly string[]): boolean {
  return keys.some((key) => CATEGORY_INDEX.get(key)?.requiresLicensedProfessional === true);
}

/**
 * Qualifikationen. `licensesProfessionalWork` entscheidet, ob erlaubnispflichtige
 * Anfragen sichtbar werden -- und zwar nur bei Status "approved" und gueltigem Datum.
 */
export const QUALIFICATIONS: Qualification[] = [
  {
    key: 'heilerziehungspflege',
    label: 'Heilerziehungspfleger:in',
    licensesProfessionalWork: true,
    expires: false,
  },
  { key: 'pflegefachkraft', label: 'Pflegefachkraft', licensesProfessionalWork: true, expires: false },
  {
    key: 'altenpflege',
    label: 'Altenpfleger:in',
    licensesProfessionalWork: true,
    expires: false,
  },
  {
    key: 'alltagsbegleitung_43b',
    label: 'Qualifizierte Alltagsbegleitung',
    licensesProfessionalWork: false,
    expires: false,
  },
  {
    key: 'erste_hilfe',
    label: 'Erste-Hilfe-Kurs',
    licensesProfessionalWork: false,
    expires: true,
  },
  {
    key: 'fuehrungszeugnis_erweitert',
    label: 'Erweitertes Führungszeugnis',
    licensesProfessionalWork: false,
    expires: true,
  },
  {
    key: 'identitaet',
    label: 'Identitätsprüfung',
    licensesProfessionalWork: false,
    expires: false,
  },
  {
    key: 'dgs_kompetenz',
    label: 'Nachweis Gebärdensprach-Kompetenz',
    licensesProfessionalWork: false,
    expires: false,
  },
  {
    key: 'haftpflicht',
    label: 'Haftpflichtversicherung',
    licensesProfessionalWork: false,
    expires: true,
  },
];

const QUALIFICATION_INDEX = new Map(QUALIFICATIONS.map((q) => [q.key, q]));

export function getQualification(key: string): Qualification | undefined {
  return QUALIFICATION_INDEX.get(key);
}

/** Kategorien, die einer Person mit dieser Rolle ueberhaupt offenstehen. */
export function selectableCategories(canDoProfessionalWork: boolean): ServiceCategory[] {
  return SERVICE_CATEGORIES.filter(
    (c) => !c.requiresLicensedProfessional || canDoProfessionalWork,
  );
}
