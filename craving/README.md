# CRAVING — Food-Ordering-App

Bestellsystem mit sichtbarem Food-Builder: Doener, Pizza und Croque werden
Zutat fuer Zutat zusammengestellt und dabei tatsaechlich dargestellt —
keine Kreuzchenliste, sondern ein Produkt, das mitwaechst.

**Stand: Testphase.** Es werden keine echten Bestellungen ausgeloest und
keine Zahlungen abgewickelt. Firmen- und Rechtsdaten sind als Platzhalter
markiert (`data/config.ts`, Seiten unter `/rechtliches`).

---

## Schnellstart

```bash
cd craving
npm install
npm run dev          # http://localhost:3000
```

Weitere Befehle:

```bash
npm run build        # Produktionsbuild
npm run start        # Build lokal ausliefern
npm run lint         # ESLint (Flat Config)
npm run typecheck    # tsc --noEmit, strict
```

Node 20+ wird vorausgesetzt (entwickelt mit Node 22).

---

## Was drin ist

| Bereich | Route | Kurz |
| --- | --- | --- |
| Startseite | `/` | Hero, Scroll-Erzaehlung (Produkt baut sich beim Scrollen auf), Kategorien, Fakten |
| Menue | `/menue` | Vorlagen je Kategorie, Beilagen, Getraenke, Menue-Angebote |
| Builder | `/bauen/[kategorie]` | Der Kern: Buehne + Konfiguration + Live-Preis |
| Warenkorb | `/warenkorb` | Positionen, Lieferart, PLZ, Gutschein, Trinkgeld, Empfehlungen |
| Kasse | `/kasse` | Vier Schritte: Lieferung, Kontakt, Zahlung, Pruefen |
| Bestellungen | `/bestellungen`, `/bestellungen/[id]` | Liste, Statusverlauf, „Nochmal bestellen" |
| Konto | `/konto`, `/konto/favoriten` | Profil, Adressen, Gutscheine, gespeicherte Konfigurationen |
| Rechtliches | `/rechtliches/*` | Impressum, Datenschutz, AGB, Widerruf, Allergene |

Bestellen funktioniert **ohne Konto**. Warenkorb, Favoriten, Adressen und
Bestellhistorie liegen im Geraet (localStorage), sauber gekapselt in
`lib/storage.ts`.

---

## Aufbau

```
src/
  app/            Routen (App Router), Metadaten, manifest/robots/sitemap
  components/
    ui/           Knoepfe, Felder, Sheet, Toasts, Skeletons, Leerzustaende
    layout/       Kopfzeile, Bottom-Navigation, Fusszeile, Flugbahn, Offline-Hinweis
    home/         Hero, Scroll-Erzaehlung, Kategorie-Karten, Fakten
    providers/    Store-Hydrierung, weiches Scrollen (Lenis)
  features/
    builder/      Food-Builder inkl. Renderer (das Herzstueck)
    cart/  checkout/  tracking/  menu/  account/
  data/           Kategorien, Zutaten, Optionen, Produkte, Betrieb, Marketing
  lib/            Preise, Oeffnungszeiten, Liefergebiete, Validierung, Zahlung
  stores/         Zustand-Stores (Warenkorb, Konto, UI)
  types/          Domaenenmodell
```

Grundsatz: **Das UI enthaelt keine Preise, keine Produkte, keine Regeln.**
Alles kommt aus `src/data` und wird ueber `src/lib` ausgewertet.

---

## Der Food-Builder

Jede Zutat traegt eine Darstellungsanweisung (`visual`), keine fertige
Grafik:

```ts
{
  id: "pz-salami",
  name: "Salami",
  price: 150,                        // Cent
  visual: {
    z: 40,                           // Stapelebene
    shape: "slice",                  // Grundform
    palette: ["#A83A2E", "#6E1F16", "#C75A4B", "#EFD9C6"],
    density: 1, scale: 0.92,
  },
  allergens: ["senf"],
  nutrition: { kcal: 190, protein: 11, carbs: 1, fat: 16 },
}
```

Der Renderer der Kategorie setzt daraus die Szene zusammen: Verteilung,
Schattierung, Textur und die Bewegung beim Hinzufuegen (Scheiben fallen,
Salat streut, Sosse wird gezogen). Die Verteilung ist **deterministisch**
(Seed aus der Zutaten-ID) — dieselbe Salami liegt bei jedem Rendern an
derselben Stelle, aber nie im Raster.

Details und der Weg zu Foto-Ebenen oder 3D: `docs/ARCHITEKTUR.md`.

### Neue Zutat

1. Eintrag in `src/data/ingredients.ts` (mit `visual`, Allergenen, Preis).
2. ID in die passende Gruppe in `src/data/categories.ts` aufnehmen.
Fertig — Auswahl, Darstellung, Preis, Allergenausweis und Warenkorb
funktionieren ohne weitere Aenderung.

### Neue Kategorie

1. Zutaten und Optionen anlegen.
2. Kategorie mit `builder.groups` und `builder.steps` in
   `src/data/categories.ts` beschreiben.
3. Renderer in `src/features/builder/renderers/` ergaenzen und in
   `renderers/index.tsx` verzweigen.
4. Produkte in `src/data/products.ts`.

---

## Betrieb konfigurieren

Alles in `src/data/config.ts`:

- `BRAND` — Name, Anschrift, Kontakt (aktuell Platzhalter)
- `OPENING_HOURS` / `OPENING_EXCEPTIONS` — inkl. Zeiten ueber Mitternacht
- `DELIVERY_ZONES` — PLZ, Mindestbestellwert, Lieferkosten, Freigrenze, Dauer
- `PAYMENT_METHODS` — sichtbar/aktiv je Abwicklungsart
- `COUPONS`, `TIP_PRESETS`, `ORDER_STATUS_FLOW`
- `DEMO_MODE` — steuert Hinweisbanner und `robots.txt`

Verfuegbarkeit: Produkte und Zutaten haben `available` und optional
`unavailableReason`. Gesperrte Zutaten bleiben sichtbar, sind aber nicht
waehlbar („Heute ausverkauft") — der Kunde soll wissen, dass es sie gibt.

---

## Technik

- **Next.js 16** (App Router), **React 19**, **TypeScript strict**
- **Tailwind CSS v4** — Tokens in `src/app/globals.css` unter `@theme`
- **Framer Motion** fuer Bewegung, **Lenis** fuer weiches Scrollen
  (aus bei `prefers-reduced-motion` und auf Touch-Geraeten)
- **Zustand** fuer Warenkorb/Konto, Persistenz mit `skipHydration` und
  Nachladen im Effekt — dadurch keine Hydration-Fehler
- Schriften ueber `next/font` (Anton, Manrope, JetBrains Mono) — werden zum
  Build eingebettet, es laedt nichts von fremden Servern
- Keine 3D-Bibliothek: die Darstellung ist SVG. Der Renderer-Vertrag ist
  aber so geschnitten, dass eine WebGL-Variante daneben treten kann
  (siehe `docs/ARCHITEKTUR.md`)

---

## Werkzeuge

Kleine Skripte fuer die Abnahme (brauchen einen laufenden Server):

```bash
npm run smoke   # Bestellstrecke einmal komplett durchklicken
npm run qa      # Layout auf 375/768/1440/2560 px pruefen (Ueberlauf, Fehler)
npm run perf    # LCP, CLS und uebertragene Bytes messen
npm run icons   # Symbole und Startbildschirm-Grafiken neu erzeugen
```

`SMOKE_BASE` bzw. `PERF_BASE` setzen, wenn der Server nicht auf Port 3000
laeuft.

---

## Weiterlesen

- `docs/ARCHITEKTUR.md` — Datenfluss, Renderer-Vertrag, Erweiterung auf 3D
- `docs/ASSETS.md` — welche Fotos/Videos noch fehlen und in welchem Format
- `docs/BACKEND.md` — geplante Schnittstellen und Adminbereich
- `docs/GO-LIVE.md` — Checkliste vor dem Start
