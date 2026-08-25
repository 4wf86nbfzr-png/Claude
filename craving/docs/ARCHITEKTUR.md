# Architektur

## Leitgedanke

Drei Schichten, klar getrennt:

```
data/     Was es gibt (Kategorien, Zutaten, Optionen, Produkte, Betrieb)
lib/      Was gilt  (Preis, Oeffnung, Liefergebiet, Validierung, Zahlung)
features/ Was man sieht und tut (Builder, Warenkorb, Kasse, Tracking)
```

Das UI liest ausschliesslich aus `data` und rechnet ausschliesslich mit
`lib`. Es gibt keine Preise, Mindestbestellwerte oder Produktnamen im JSX.
Der Nutzen zeigt sich beim Anschluss eines Backends: dann wird `data`
gegen einen Datenlader ausgetauscht, `lib` und `features` bleiben.

---

## Datenfluss im Builder

```
Produkt-Preset ─┐
Gruppen-Defaults ┴─► selections: { [groupId]: string[] }   (einziger Zustand)
                              │
        ┌─────────────────────┼───────────────────────┐
        ▼                     ▼                       ▼
selectedIngredients()   optionEffects()          priceBuild()
   Ebenen nach z         Groesse, Schaerfe,        Grundpreis
        │                Teigvariante              + Optionen
        ▼                     │                    + Belag × Faktor
   <FoodRender/> ◄────────────┘                       │
                                                      ▼
                                              Preisleiste / Warenkorb
```

`selections` ist die einzige Wahrheit. Alles andere wird daraus abgeleitet
(`useMemo`), nichts doppelt gespeichert. Genau deshalb koennen Favoriten
und Warenkorbzeilen dieselbe Struktur transportieren: eine gespeicherte
Konfiguration ist nur ein `selections`-Objekt plus Produkt-ID.

---

## Renderer-Vertrag

```ts
interface RendererProps {
  ingredients: Ingredient[];              // nach visual.z sortiert
  effects: { sizeScale: number; spice: number; variants: string[] };
  label: string;                          // fuer Screenreader
}
```

Mehr weiss eine Darstellung nicht. Sie kennt weder Preise noch Gruppen
noch den Warenkorb. Ausgewaehlt wird in `renderers/index.tsx` per
Verzweigung auf die Kategorie — bewusst ausgeschrieben, damit React die
Komponententypen stabil haelt (eine aus einer Map gelesene Komponente
wuerde bei jedem Rendern als „neuer Typ" gelten und den Zustand der
Ebenen-Animation verlieren).

### Bausteine der Darstellung

| Datei | Aufgabe |
| --- | --- |
| `renderers/geometry.ts` | Verteilung: Punkte auf der Kreisflaeche (Pizza), Baender (Doener/Croque), Klecks- und Scheibenpfade |
| `renderers/pieces.tsx` | Die Einzelstuecke je Grundform (Scheibe, Ring, Streifen, Wuerfel, Blatt, Sichel) |
| `renderers/texture.tsx` | Koernung und Backfarbe (feTurbulence), einmal pro Renderer |
| `IngredientLayer.tsx` | Bewegung: Eintritt, Austritt, Staffelung; Sosse als gezogener Strich, Kaese als aufziehende Maske |
| `FoodPreview.tsx` | Buehne: Drehen, Zoomen, Zeigerparallaxe, Lichtstimmung |

### Warum deterministischer Zufall

`lib/rng.ts` liefert einen Seed aus der Zutaten-ID. Echter Zufall haette
zwei Nachteile: Server und Client wuerden unterschiedliche Positionen
erzeugen (Hydration-Fehler), und jede Zustandsaenderung wuerde das Produkt
neu wuerfeln. Alle erzeugten Koordinaten werden zusaetzlich gerundet —
sonst unterscheiden sich Server- und Client-Zahlen in der letzten
Nachkommastelle, was React ebenfalls als Abweichung meldet.

---

## Foto-Ebenen statt Zeichnung

Jede Zutat kann eine Bildebene mitbringen:

```ts
visual: {
  z: 40, shape: "slice", palette: [...],
  sprite: { src: "/food/pizza/salami.avif", width: 512, height: 512 },
}
```

Der Renderer bevorzugt `sprite`, sobald es gesetzt ist, und faellt sonst
auf die prozedurale Darstellung zurueck. So laesst sich Kategorie fuer
Kategorie auf echte Fotografie umstellen, ohne Logik anzufassen.
Anforderungen an das Material: `ASSETS.md`.

---

## Erweiterung auf 3D (React Three Fiber)

Der Vertrag ist bewusst darstellungsneutral. Eine WebGL-Variante:

1. `renderers/PizzaScene3D.tsx` mit derselben `RendererProps`-Signatur;
   die Ebenen werden zu Meshes, `visual.z` zur Hoehe, `palette` zum
   Material.
2. In `renderers/index.tsx` verzweigen — sinnvollerweise abhaengig von
   `navigator.deviceMemory`/`hardwareConcurrency` oder einem Schalter in
   `data/config.ts`, damit schwache Geraete bei SVG bleiben.
3. `dynamic(() => import(...), { ssr: false })` verwenden: Three.js gehoert
   nicht ins Serverbundle und nicht in den kritischen Pfad.

Bewusst nicht heute umgesetzt: fuer die Testphase bringt SVG dieselbe
Aussage bei einem Bruchteil der Ladezeit, und ohne echte 3D-Modelle waere
eine WebGL-Szene nur eine teurere Zeichnung.

---

## Zustand und Persistenz

- `stores/cart-store.ts` — Positionen, Lieferart, PLZ, Gutschein, Trinkgeld
- `stores/account-store.ts` — Bestellungen, Favoriten, Adressen, Profil, Ton
- `stores/ui-store.ts` — Hinweise (Toasts), Flugbahn zum Warenkorb

Beide persistierten Stores laufen mit `skipHydration: true`. Der
`StoreHydrator` liest sie nach dem ersten Client-Render nach. Komponenten
fragen `useHydrated()` und zeigen bis dahin Platzhalter — dadurch gibt es
keine Abweichung zwischen Server- und Client-Markup.

Identische Konfigurationen werden im Warenkorb zusammengefasst (Mengen
statt Doppelzeilen); Grundlage ist ein Fingerabdruck aus Produkt-ID,
Auswahl und Anmerkung.

---

## Zahlung

`lib/payment/provider.ts` definiert `PaymentProvider` mit `supports()` und
`createIntent()`. Aktiv ist nur der `offlineProvider` (Bar/EC vor Ort).
Online-Verfahren melden `unavailable` — es gibt bewusst **keine**
Schein-Zahlung. Eine spaetere Stripe- oder PayPal-Anbindung registriert
sich ueber `registerProvider()`; das UI bleibt unveraendert.

---

## Bestellstatus

`lib/orders.ts` leitet den Status aus der verstrichenen Zeit ab
(`ORDER_STATUS_FLOW` in `data/config.ts`). Sobald ein Kuechensystem
angebunden ist, liefert dieses `order.status` und die Funktion gibt ihn
unveraendert zurueck — die Tracking-Oberflaeche muss nicht angefasst
werden.
