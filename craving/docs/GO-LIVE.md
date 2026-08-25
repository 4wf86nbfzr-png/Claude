# Vor dem Live-Gang

Reihenfolge ist Absicht: erst rechtlich sauber, dann technisch scharf
schalten.

## 1. Rechtliches (blockierend)

- [ ] `src/data/config.ts` → `BRAND`: Firma, Anschrift, Vertretung,
      Telefon, E-Mail, Handelsregister, USt-IdNr., Aufsichtsbehoerde
- [ ] `/rechtliches/impressum` — alle `[bitte ergaenzen]` ersetzen
- [ ] `/rechtliches/datenschutz` — Hoster, Auftragsverarbeiter,
      Speicherfristen, Zahlungsdienstleister
- [ ] `/rechtliches/agb` und `/rechtliches/widerruf` anwaltlich pruefen lassen
- [ ] `/rechtliches/allergene` — Demo-Werte gegen die echten Rezepturen
      und Lieferantenangaben tauschen (auch `nutrition` je Zutat)
- [ ] Preise, Mindestbestellwerte, Lieferkosten und Zonen bestaetigen

## 2. Betrieb

- [ ] `OPENING_HOURS` und Feiertage in `OPENING_EXCEPTIONS`
- [ ] `DELIVERY_ZONES` mit den tatsaechlichen PLZ
- [ ] `PICKUP_ETA_MINUTES` und Zonendauern realistisch setzen
- [ ] `COUPONS` — Testcodes entfernen oder deaktivieren

## 3. Bestellungen und Zahlung

- [ ] Endpunkt fuer Bestellungen anbinden (siehe `BACKEND.md`)
- [ ] Preis serverseitig nachrechnen und Abweichungen ablehnen
- [ ] Zahlungsanbieter registrieren, betroffene `PAYMENT_METHODS`
      auf `enabled: true`
- [ ] Bestaetigungs-E-Mail an Kunde und Kueche

## 4. Scharf schalten

- [ ] `DEMO_MODE = false` in `src/data/config.ts`
      (entfernt die Testbanner und gibt `robots.txt` frei)
- [ ] `robots`-Eintrag in `src/app/layout.tsx` von `index: false` auf
      `index: true` stellen
- [ ] `NEXT_PUBLIC_SITE_URL` auf die echte Domain setzen (Canonical, OG,
      Sitemap)
- [ ] `public/og.png` mit echtem Foto ersetzen

## 5. Technische Abnahme

- [ ] `npm run build`, `npm run lint`, `npm run typecheck` ohne Befund
- [ ] Lighthouse auf `/`, `/menue`, `/bauen/pizza` (mobil und Desktop)
- [ ] Bestellstrecke auf echtem Telefon durchspielen, inkl. Abholung
- [ ] Tastaturbedienung: Builder, Warenkorb, Kasse ohne Maus
- [ ] Anzeige mit `prefers-reduced-motion: reduce` pruefen
- [ ] Offline-Verhalten: Flugmodus einschalten — Warenkorb muss bleiben
- [ ] Startbildschirm-Installation auf iOS und Android testen

## 6. Nach dem Start

- [ ] Fehlerueberwachung anbinden (Platzhalter in `src/app/error.tsx`)
- [ ] Reichweitenmessung nur mit Einwilligung oder ohne Personenbezug
- [ ] Regelmaessig: `available`-Schalter pflegen, damit niemand etwas
      bestellt, was ausverkauft ist
