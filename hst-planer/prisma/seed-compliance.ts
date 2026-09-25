import { PrismaClient, $Enums } from '@prisma/client';

/**
 * Grundbestand der Compliance-Zentrale (SecPlan 15–23).
 *
 * Das hier ist ein ARBEITSSTAND, kein fertiges Datenschutzkonzept.
 * Alle Rechtsgrundlagen stehen absichtlich auf OFFEN oder tragen den
 * Status ENTWURF – die Einträge sagen, was das System tut, nicht dass
 * es rechtlich geprüft wäre. Den Status RECHTLICH_GEPRUEFT vergibt eine
 * benannte Person, nachdem sie hingesehen hat.
 *
 * Die TOM sind die Ausnahme: dass ein Passwort mit scrypt gehasht wird,
 * lässt sich im Quelltext nachsehen. Deshalb tragen sie
 * TECHNISCH_UMGESETZT und eine Fundstelle – das ist eine Tatsachen-
 * behauptung über den Code, keine über die Angemessenheit.
 */

const TAG = 86_400_000;

export async function seedCompliance(db: PrismaClient): Promise<void> {
  const heute = new Date();
  const in6Monaten = new Date(heute.getTime() + 182 * TAG);
  const in12Monaten = new Date(heute.getTime() + 365 * TAG);

  await db.$transaction([
    db.processorLink.deleteMany(), db.processingActivity.deleteMany(), db.processor.deleteMany(),
    db.retentionRule.deleteMany(), db.dataSubjectRequest.deleteMany(), db.dataBreach.deleteMany(),
    db.dpia.deleteMany(), db.tomMeasure.deleteMany(), db.complianceDocument.deleteMany(),
    db.documentToken.deleteMany(), db.documentAccessLog.deleteMany(), db.exportLog.deleteMany(),
    db.employeeSensitive.deleteMany(),
    db.trainingParticipant.deleteMany(), db.training.deleteMany(),
    db.applicant.deleteMany(), db.objekt.deleteMany(),
  ]);

  // --- Löschkonzept -------------------------------------------------------
  const regeln: Array<{
    category: string; purpose: string; lawfulBasis: $Enums.RechtsgrundlageArt;
    keepReason: string | null; months: number; startsFrom: string; responsible: string;
  }> = [
    {
      category: 'Bewerberdaten (Absage)',
      purpose: 'Auswahl von Bewerbern für offene Stellen',
      lawfulBasis: 'PARA26_BDSG_BESCHAEFTIGUNG',
      keepReason: 'Klagefrist § 61b ArbGG in Verbindung mit § 15 Abs. 4 AGG',
      months: 6, startsFrom: 'Zugang der Absage', responsible: 'Personal',
    },
    {
      category: 'Personalakte',
      purpose: 'Durchführung des Beschäftigungsverhältnisses',
      lawfulBasis: 'PARA26_BDSG_BESCHAEFTIGUNG',
      keepReason: 'Nachweispflichten nach Ende des Arbeitsverhältnisses',
      months: 36, startsFrom: 'Ende des Beschäftigungsverhältnisses', responsible: 'Personal',
    },
    {
      category: 'Lohnrelevante Unterlagen',
      purpose: 'Abrechnung und steuerliche Nachweise',
      lawfulBasis: 'ART6_1C_RECHTLICHE_PFLICHT',
      keepReason: '§ 147 AO, § 257 HGB',
      months: 120, startsFrom: 'Ende des Kalenderjahres der Entstehung', responsible: 'Buchhaltung',
    },
    {
      category: 'Einsatzdokumentation',
      purpose: 'Nachweis der erbrachten Leistung gegenüber dem Kunden',
      lawfulBasis: 'ART6_1B_VERTRAG',
      keepReason: 'Verjährung vertraglicher Ansprüche',
      months: 36, startsFrom: 'Ende des Einsatzes', responsible: 'Disposition',
    },
    {
      category: 'Führungszeugnis',
      purpose: 'Zuverlässigkeitsprüfung im Bewachungsgewerbe',
      lawfulBasis: 'ART6_1C_RECHTLICHE_PFLICHT',
      keepReason: '§ 34a GewO in Verbindung mit der Bewachungsverordnung',
      months: 12, startsFrom: 'Ausstellungsdatum', responsible: 'Personal',
    },
    {
      category: 'Kommunikation mit Bewerbern und Kunden',
      purpose: 'Nachvollziehbarkeit von Absprachen',
      lawfulBasis: 'ART6_1F_BERECHTIGTES_INTERESSE',
      keepReason: null,
      months: 24, startsFrom: 'Letzter Schriftwechsel', responsible: 'Disposition',
    },
    {
      category: 'Protokolldaten (Audit-Log)',
      purpose: 'Nachweis und Aufklärung von Zugriffen',
      lawfulBasis: 'ART6_1F_BERECHTIGTES_INTERESSE',
      keepReason: 'Aufklärung von Sicherheitsvorfällen',
      months: 12, startsFrom: 'Zeitpunkt des Eintrags', responsible: 'Systemadministration',
    },
    {
      category: 'Gesundheitsbezogene Angaben',
      purpose: 'Erfüllung arbeitsrechtlicher Pflichten',
      lawfulBasis: 'OFFEN',
      keepReason: null,
      months: 12, startsFrom: 'Wegfall des Zwecks', responsible: 'Personal',
    },
  ];
  await db.retentionRule.createMany({
    data: regeln.map((r) => ({ ...r, status: 'ENTWURF' as const })),
  });

  // --- Auftragsverarbeiter ------------------------------------------------
  const verarbeiter = await Promise.all([
    db.processor.create({
      data: {
        name: 'Netlify', service: 'Auslieferung der Webseite und Formularannahme',
        country: 'US', thirdCountry: true, transferBasis: 'EU-Standardvertragsklauseln (Modul 2)',
        avvStatus: 'NICHT_VORHANDEN', personalData: true,
        note: 'Betrifft nur die öffentliche Webseite, nicht den Planer. Vor dem Live-Gang zu klären.',
      },
    }),
    db.processor.create({
      data: {
        name: 'Hetzner Online GmbH', service: 'Serverbetrieb und Datensicherung',
        country: 'DE', thirdCountry: false,
        avvStatus: 'ENTWURF', personalData: true,
        subProcessors: 'Rechenzentren in Falkenstein und Nürnberg',
        note: 'Vertragsentwurf liegt vor, Unterschrift steht aus.',
      },
    }),
    db.processor.create({
      data: {
        name: 'Anthropic', service: 'Optionale Textauswertung eingehender Anfragen',
        country: 'US', thirdCountry: true, transferBasis: null,
        avvStatus: 'NICHT_VORHANDEN', personalData: false, aiSystem: true,
        aiTrainingUse: 'Anbieter gibt an, Inhalte aus der API nicht zum Training zu verwenden – nicht unabhängig geprüft.',
        note: 'Standardmäßig ausgeschaltet. Wenn eingeschaltet, geht der Text einer Anfrage hin, keine Mitarbeiterdaten. Vor produktiver Nutzung: AVV, Drittlandtransfer und Rechtsgrundlage klären.',
      },
    }),
  ]);

  // --- Verzeichnis von Verarbeitungstätigkeiten ---------------------------
  const taetigkeiten = await Promise.all([
    db.processingActivity.create({
      data: {
        number: 'VVT-01', name: 'Personalverwaltung',
        purpose: 'Begründung, Durchführung und Beendigung von Beschäftigungsverhältnissen',
        lawfulBasis: 'PARA26_BDSG_BESCHAEFTIGUNG',
        lawfulBasisNote: 'Vom Personalbüro eingetragen, anwaltlich noch nicht bestätigt.',
        dataSubjects: 'Mitarbeiter, Aushilfen',
        dataCategories: 'Stammdaten, Kontaktdaten, Qualifikationen, Vertragsdaten, Arbeitszeiten',
        recipients: 'Lohnbuchhaltung (extern), Sozialversicherungsträger',
        retention: 'Personalakte 3 Jahre nach Ende, lohnrelevante Unterlagen 10 Jahre',
        responsible: 'Personal', status: 'ENTWURF', nextReviewAt: in12Monaten,
      },
    }),
    db.processingActivity.create({
      data: {
        number: 'VVT-02', name: 'Einsatzplanung und Disposition',
        purpose: 'Planung, Besetzung und Nachweis von Sicherheits- und Serviceeinsätzen',
        lawfulBasis: 'ART6_1B_VERTRAG',
        dataSubjects: 'Mitarbeiter, Kräfte von Partnerunternehmen',
        dataCategories: 'Name, Qualifikation, Verfügbarkeit, Einsatzzeit, Einsatzort',
        recipients: 'Kunden (nur Name und Funktion), Partnerunternehmen',
        retention: 'Einsatzdokumentation 3 Jahre ab Ende des Einsatzes',
        responsible: 'Disposition', status: 'ENTWURF', nextReviewAt: in12Monaten,
      },
    }),
    db.processingActivity.create({
      data: {
        number: 'VVT-03', name: 'Bewerbermanagement',
        purpose: 'Auswahl von Bewerbern für offene Stellen',
        lawfulBasis: 'PARA26_BDSG_BESCHAEFTIGUNG',
        dataSubjects: 'Bewerber',
        dataCategories: 'Stammdaten, Kontaktdaten, Bewerbungsunterlagen',
        retention: 'Sechs Monate nach Absage',
        responsible: 'Personal', status: 'ENTWURF', nextReviewAt: in6Monaten,
      },
    }),
    db.processingActivity.create({
      data: {
        number: 'VVT-04', name: 'Zuverlässigkeitsprüfung nach § 34a GewO',
        purpose: 'Nachweis der Zuverlässigkeit von Wachpersonal',
        lawfulBasis: 'ART6_1C_RECHTLICHE_PFLICHT',
        dataSubjects: 'Mitarbeiter im Bewachungsgewerbe',
        dataCategories: 'Führungszeugnis, Sachkundenachweis, Unterrichtungsnachweis',
        specialCategory: true,
        recipients: 'Zuständige Behörde auf Verlangen',
        retention: 'Führungszeugnis 12 Monate ab Ausstellung',
        responsible: 'Personal', status: 'ENTWURF', nextReviewAt: in6Monaten,
      },
    }),
    db.processingActivity.create({
      data: {
        number: 'VVT-05', name: 'Protokollierung von Zugriffen',
        purpose: 'Nachweis und Aufklärung von Zugriffen auf personenbezogene Daten',
        lawfulBasis: 'ART6_1F_BERECHTIGTES_INTERESSE',
        lawfulBasisNote: 'Interessenabwägung ist zu dokumentieren – steht noch aus.',
        dataSubjects: 'Benutzer des Planers',
        dataCategories: 'Benutzername, Zeitpunkt, Vorgang, IP-Adresse',
        retention: 'Zwölf Monate ab Eintrag',
        responsible: 'Systemadministration', status: 'ENTWURF', nextReviewAt: in12Monaten,
      },
    }),
    db.processingActivity.create({
      data: {
        number: 'VVT-06', name: 'Kundenverwaltung und Angebotswesen',
        purpose: 'Bearbeitung von Anfragen, Angebote und Abrechnung',
        lawfulBasis: 'ART6_1B_VERTRAG',
        dataSubjects: 'Ansprechpartner bei Kunden',
        dataCategories: 'Name, Funktion, dienstliche Kontaktdaten',
        retention: 'Kommunikation 2 Jahre, Rechnungen 10 Jahre',
        responsible: 'Geschäftsführung', status: 'ENTWURF', nextReviewAt: in12Monaten,
      },
    }),
  ]);

  await db.processorLink.createMany({
    data: [
      { processorId: verarbeiter[1]!.id, activityId: taetigkeiten[0]!.id },
      { processorId: verarbeiter[1]!.id, activityId: taetigkeiten[1]!.id },
      { processorId: verarbeiter[1]!.id, activityId: taetigkeiten[4]!.id },
      { processorId: verarbeiter[2]!.id, activityId: taetigkeiten[5]!.id },
    ],
  });

  // --- Technische und organisatorische Maßnahmen --------------------------
  const tom: Array<{
    bereich: $Enums.TomBereich; title: string; description: string;
    status: $Enums.TomStatus; evidence: string | null; responsible: string;
  }> = [
    {
      bereich: 'ZUGANG', title: 'Passwörter werden nur als Hash gespeichert',
      description: 'scrypt mit zufälligem Salz je Passwort. Klartextpasswörter werden nirgends gespeichert und nirgends protokolliert.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/auth/password.ts', responsible: 'Systemadministration',
    },
    {
      bereich: 'ZUGANG', title: 'Sperre nach wiederholten Fehlversuchen',
      description: 'Nach mehreren Fehlversuchen wird das Konto vorübergehend gesperrt; zusätzlich begrenzt eine Ratenbremse Versuche je Adresse.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/auth/session.ts, src/lib/rate-limit.ts', responsible: 'Systemadministration',
    },
    {
      bereich: 'ZUGANG', title: 'Zweiter Faktor für privilegierte Zugänge',
      description: 'Zeitbasierte Einmalkennwörter (TOTP) für Rollen mit Zugriff auf Personalakten und Benutzerverwaltung.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/auth/totp.ts, /konto/sicherheit', responsible: 'Systemadministration',
    },
    {
      bereich: 'ZUGRIFF', title: 'Rollenkonzept mit Standard DENY ALL',
      description: 'Eine Rolle kann nur, was ausdrücklich aufgezählt ist. Es gibt keine Vererbung und keinen Platzhalter außer der Superadmin-Rolle.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/auth/rbac.ts, tests/rechte.test.ts', responsible: 'Systemadministration',
    },
    {
      bereich: 'ZUGRIFF', title: 'Feldweise Einschränkung in der Personalakte',
      description: 'Vertrag, private Anschrift und interne Notizen werden für Rollen ohne Freigabe nicht aus der Datenbank geladen.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/queries/scope.ts (personenAuswahl)', responsible: 'Systemadministration',
    },
    {
      bereich: 'ZUGRIFF', title: 'Dokumente ohne öffentliche Adresse',
      description: 'Dateien liegen außerhalb des ausgelieferten Verzeichnisses. Der Abruf läuft über eine Route, die Anmeldung, Recht und Zugriffsebene prüft.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/storage.ts, src/app/api/dokumente/[id]/route.ts', responsible: 'Systemadministration',
    },
    {
      bereich: 'EINGABE', title: 'Protokollierung aller Änderungen',
      description: 'Jede fachliche Änderung wird mit Benutzer, Zeitpunkt, altem und neuem Wert festgehalten. Geheimnisse werden dabei herausgefiltert.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/audit.ts', responsible: 'Systemadministration',
    },
    {
      bereich: 'EINGABE', title: 'Protokoll ist nicht änderbar',
      description: 'Es gibt in der Oberfläche keine Möglichkeit, einen Protokolleintrag zu ändern oder zu löschen, und keine Server-Aktion dafür.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/app/(app)/compliance/audit-log', responsible: 'Systemadministration',
    },
    {
      bereich: 'WEITERGABE', title: 'Verschlüsselte Übertragung',
      description: 'Auslieferung ausschließlich über TLS; Sitzungskennungen werden als httpOnly-, secure- und sameSite-Cookie gesetzt.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/auth/session.ts, next.config.ts', responsible: 'Systemadministration',
    },
    {
      bereich: 'WEITERGABE', title: 'Exporte werden protokolliert',
      description: 'Jeder Export hält Benutzer, Bereich, Format, Anzahl der Datensätze und den angewandten Filter fest.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/export/protokoll.ts', responsible: 'Systemadministration',
    },
    {
      bereich: 'VERSCHLUESSELUNG', title: 'Besondere Kategorien verschlüsselt ablegen',
      description: 'Angaben nach Art. 9 DSGVO liegen in einer eigenen Tabelle und werden mit einem Schlüssel aus der Umgebung verschlüsselt.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/krypto.ts, Modell EmployeeSensitive', responsible: 'Systemadministration',
    },
    {
      bereich: 'TRENNUNG', title: 'Mandantentrennung über Sichtbarkeitsbereiche',
      description: 'Kunden sehen nur eigene Aufträge, Partner nur Einsätze mit eigenen Kräften. Der Filter wird in jede Abfrage gemischt.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/queries/scope.ts', responsible: 'Systemadministration',
    },
    {
      bereich: 'VERFUEGBARKEIT', title: 'Datensicherung',
      description: 'Tägliche Sicherung der Datenbank und des Dokumentenverzeichnisses.',
      status: 'NICHT_UMGESETZT', evidence: null, responsible: 'Systemadministration',
    },
    {
      bereich: 'WIEDERHERSTELLUNG', title: 'Wiederherstellung erproben',
      description: 'Eine Sicherung, die noch nie zurückgespielt wurde, ist keine.',
      status: 'NICHT_UMGESETZT', evidence: null, responsible: 'Systemadministration',
    },
    {
      bereich: 'ZUTRITT', title: 'Zutritt zum Büro',
      description: 'Schließanlage, Besucher werden begleitet, Unterlagen werden nicht offen liegen gelassen.',
      status: 'ORGANISATORISCH_GEREGELT', evidence: null, responsible: 'Geschäftsführung',
    },
    {
      bereich: 'AUFTRAG', title: 'Auftragsverarbeiter führen und prüfen',
      description: 'Liste der Auftragsverarbeiter mit Vertragsstand, Unterauftragnehmern und Drittlandtransfers.',
      status: 'TECHNISCH_UMGESETZT', evidence: '/compliance/avv', responsible: 'Geschäftsführung',
    },
    {
      bereich: 'UEBERPRUEFUNG', title: 'Regelmäßiger Sicherheitscheck',
      description: 'Dreizehn Prüfungen auf ausgeschiedene Zugänge, fehlenden zweiten Faktor, offene Anfragen, fällige Löschungen und auffällige Zugriffe.',
      status: 'TECHNISCH_UMGESETZT', evidence: 'src/lib/compliance/sicherheitscheck.ts', responsible: 'Geschäftsführung',
    },
    {
      bereich: 'VERFUEGBARKEIT', title: 'Verpflichtung auf das Datengeheimnis',
      description: 'Alle Beschäftigten werden vor dem ersten Zugriff schriftlich verpflichtet.',
      status: 'ORGANISATORISCH_GEREGELT', evidence: null, responsible: 'Personal',
    },
  ];
  await db.tomMeasure.createMany({
    data: tom.map((m) => ({ ...m, lastCheckAt: heute, nextCheckAt: in12Monaten })),
  });

  // --- Dokumentation ------------------------------------------------------
  await db.complianceDocument.createMany({
    data: [
      {
        kind: 'RICHTLINIE', title: 'Rollen- und Rechtekonzept', version: '1.0', status: 'TECHNISCH_UMGESETZT',
        summary: 'Neun Rollen, Standard DENY ALL, feldweise Einschränkung in der Personalakte.',
        author: 'Systemadministration', nextReviewAt: in12Monaten,
      },
      {
        kind: 'VERFAHRENSANWEISUNG', title: 'Umgang mit Betroffenenanfragen', version: '0.9', status: 'ENTWURF',
        summary: 'Eingang, Identitätsprüfung, Frist nach Art. 12 Abs. 3, Beantwortung, Dokumentation.',
        author: 'Personal', nextReviewAt: in6Monaten,
      },
      {
        kind: 'VERFAHRENSANWEISUNG', title: 'Meldewege bei Datenschutzvorfällen', version: '0.9', status: 'ENTWURF',
        summary: 'Wer informiert wen innerhalb welcher Zeit; Bewertung der Meldepflicht durch eine benannte Person.',
        author: 'Geschäftsführung', nextReviewAt: in6Monaten,
      },
      {
        kind: 'INFORMATIONSPFLICHT', title: 'Datenschutzhinweise für Beschäftigte', version: '0.8', status: 'ENTWURF',
        summary: 'Information nach Art. 13 DSGVO bei Begründung des Beschäftigungsverhältnisses.',
        author: 'Personal', nextReviewAt: in6Monaten,
      },
      {
        kind: 'INFORMATIONSPFLICHT', title: 'Datenschutzhinweise für Bewerber', version: '0.8', status: 'ENTWURF',
        summary: 'Information nach Art. 13 DSGVO beim Eingang einer Bewerbung, einschließlich Löschfrist.',
        author: 'Personal', nextReviewAt: in6Monaten,
      },
      {
        kind: 'VERPFLICHTUNG', title: 'Verpflichtung auf das Datengeheimnis', version: '1.0', status: 'ENTWURF',
        summary: 'Formular zur schriftlichen Verpflichtung vor dem ersten Zugriff.',
        author: 'Personal', nextReviewAt: in12Monaten,
      },
      {
        kind: 'RICHTLINIE', title: 'Nutzung von KI-Systemen', version: '0.5', status: 'ENTWURF',
        summary: 'Keine personenbezogenen Mitarbeiterdaten an externe KI-Systeme. Keine automatisierte Bewertung von Beschäftigten.',
        author: 'Geschäftsführung', nextReviewAt: in6Monaten,
      },
      {
        kind: 'NACHWEIS', title: 'Löschkonzept', version: '0.7', status: 'ENTWURF',
        summary: 'Acht Datenkategorien mit Zweck, Grundlage, Aufbewahrungsgrund, Frist und Fristbeginn.',
        author: 'Personal', nextReviewAt: in6Monaten,
      },
    ],
  });

  // --- Folgenabschätzung --------------------------------------------------
  await db.dpia.createMany({
    data: [
      {
        title: 'Zuverlässigkeitsprüfung nach § 34a GewO',
        activityId: taetigkeiten[3]!.id,
        necessity: 'OFFEN',
        necessityNote: 'Es werden Angaben aus dem Führungszeugnis verarbeitet. Ob ein voraussichtlich hohes Risiko im Sinne des Art. 35 Abs. 1 vorliegt, ist noch zu bewerten.',
        status: 'ENTWURF', nextReviewAt: in6Monaten,
      },
      {
        title: 'Protokollierung von Zugriffen',
        activityId: taetigkeiten[4]!.id,
        necessity: 'NICHT_ERFORDERLICH',
        necessityNote: 'Protokolldaten dienen der Sicherheit, werden nicht zur Leistungskontrolle ausgewertet und nach zwölf Monaten gelöscht. Einschätzung vom Personalbüro, nicht anwaltlich bestätigt.',
        risks: 'Missbrauch zur Verhaltens- und Leistungskontrolle',
        measures: 'Zugriff auf das Protokoll nur für Superadmin und Geschäftsführung; keine Auswertung je Person in der Oberfläche',
        status: 'ENTWURF', nextReviewAt: in12Monaten,
      },
    ],
  });

  console.log('  Compliance-Grundbestand angelegt (alles im Entwurfsstand).');
}
