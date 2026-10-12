# Rechtliche Prüfungen vor dem Produktivstart

**Keine der hier genannten Vorlagen ist anwaltlich geprüft.** Die Rechtstexte auf der Website
(Impressum, Datenschutzerklärung, AGB, Widerruf) sind als Entwurf gekennzeichnet und enthalten
Platzhalter. Diese Liste ist eine Arbeitsgrundlage für das Gespräch mit einer Kanzlei
(IT-/Datenschutzrecht), keine Rechtsberatung.

## 1. Unternehmen und Impressum

- [ ] Rechtsform festlegen (Einzelunternehmen, UG, GmbH); Gewerbeanmeldung.
- [ ] Impressum nach § 5 DDG vollständig: Name, Anschrift, Kontakt, Register, USt-IdNr., Verantwortliche/r nach § 18 Abs. 2 MStV.
- [ ] Umsatzsteuer: Kleinunternehmerregelung ja/nein; Rechnungsstellung über Stripe prüfen (Stripe Invoicing/Tax).

## 2. Verträge mit Kunden (B2B)

- [ ] AGB prüfen lassen: Haftung, Verfügbarkeit, Laufzeit/Kündigung, Preisänderung, KI-Ausgaben als Entwürfe ohne Gewähr.
- [ ] Auftragsverarbeitungsvertrag (Art. 28 DSGVO) als Anlage bereitstellen; Abschluss im Registrierungsprozess (Checkbox + Download) ergänzen. **Noch nicht umgesetzt.**
- [ ] Verbraucherausschluss sauber umsetzen (B2B); andernfalls Widerrufsbelehrung mit Musterformular.
- [ ] Preisangaben: netto, „zzgl. USt.“ bei B2B zulässig; Preisangabenverordnung bei Verbrauchern beachten.

## 3. Datenschutz (DSGVO, BDSG, TDDDG)

- [ ] Verzeichnis von Verarbeitungstätigkeiten (Art. 30) anlegen.
- [ ] Datenschutz-Folgenabschätzung (Art. 35) prüfen: KI-Verarbeitung von Kundenkommunikation Dritter in großem Umfang spricht dafür.
- [ ] Auftragsverarbeiter und deren Verträge: Hoster, E-Mail-Anbieter, KI-Anbieter, Stripe, Google (bei Kalender).
- [ ] Drittlandtransfer: KI-Anbieter mit Sitz USA → Standardvertragsklauseln oder EU-US Data Privacy Framework prüfen; wenn möglich EU-Endpunkte/EU-Datenhaltung wählen. Vertraglich: keine Nutzung zum Training.
- [ ] Datenschutzerklärung vollständig (Empfänger, Rechtsgrundlagen, Fristen, Rechte, Beschwerdebehörde).
- [ ] TDDDG § 25: Es werden nur technisch notwendige Cookies (Sitzung) gesetzt → kein Consent-Banner nötig. Bei späterem Analytics erneut prüfen (cookieloses, selbst gehostetes Tool bevorzugen).
- [ ] Löschkonzept dokumentieren: Aufbewahrung je Mandant (Standard 365 Tage), Abrechnungsdaten 10 Jahre, Export 30 Tage nach Vertragsende.
- [ ] Datenschutzbeauftragte/r erforderlich? (§ 38 BDSG: i. d. R. ab 20 Personen mit ständiger Verarbeitung oder bei DSFA-Pflicht).
- [ ] Informationspflicht gegenüber den Endkunden der Handwerksbetriebe: liegt beim Betrieb (Verantwortlicher); Textbaustein für Betriebe bereitstellen.

## 4. KI-spezifisch

- [ ] EU AI Act: WerkPilot ist voraussichtlich kein Hochrisiko-System; Transparenzpflichten (Art. 50) prüfen, z. B. Hinweis, dass Entwürfe KI-generiert sind, wenn automatisch versendet wird. Automatisch versendete Eingangsbestätigungen enthalten einen KI-Hinweis (Satz am Ende); Formulierung anwaltlich prüfen.
- [ ] Keine automatisierten Entscheidungen mit Rechtswirkung (Art. 22 DSGVO) — Design hält das ein (Mensch gibt frei, keine Preise/Zusagen).
- [ ] Urheberrecht bei Marketing-Inhalten: Inhalte KI-generiert, Prüfung auf fremde Inhalte; keine fremden Bilder (Prüfung im Marketing-Agenten).

## 5. E-Mail und Werbung

- [ ] § 7 UWG: Keine Werbe-E-Mails ohne Einwilligung. Vertriebs-Agent antwortet nur auf eigene Anfragen (website_form, demo, referral, partner). Keine Kaltakquise per Mail. Beibehalten.
- [ ] Testphasen-Erinnerungen und Wochenberichte sind Vertragskommunikation; Abmeldemöglichkeit für Berichte vorhanden (Einstellung).
- [ ] Impressum/Abmeldelink in Massenmails (falls künftig Newsletter): Double-Opt-in.

## 6. Zahlungen

- [ ] Stripe-Vertrag; keine Kartendaten im eigenen System (erfüllt).
- [ ] Rechnungen: Pflichtangaben nach § 14 UStG über Stripe Invoicing sicherstellen (Steuernummer, fortlaufende Nummer).
- [ ] Mahnwesen: Stripe Smart Retries; Sperre bei Zahlungsverzug ist in AGB zu regeln.

## 7. Sicherheit und Nachweis

- [ ] Technisch-organisatorische Maßnahmen (TOM) dokumentieren: Verschlüsselung, Zugriff, Backups, Logging, Not-Aus.
- [ ] Verfahren für Datenschutzvorfälle (Art. 33/34) festlegen; Vorlage in docs/04-betrieb.md.
- [ ] Penetrationstest oder zumindest externer Security-Review vor Produktivstart.

## 8. Markenrecht

- [ ] „WerkPilot“ als Marke/Domain prüfen (DPMA, EUIPO, ähnliche Zeichen in Klasse 42). Name ist vorläufig.
