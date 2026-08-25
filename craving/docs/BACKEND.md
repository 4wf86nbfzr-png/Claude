# Backend & Adminbereich (geplant)

Heute laeuft alles ohne Server: Katalog aus TypeScript-Dateien, Warenkorb
und Bestellungen im Geraet. Dieses Dokument beschreibt, wo der Anschluss
ansetzt — die Struktur ist bereits darauf gebaut.

## 1. Katalog

`src/data/*` liefert heute statische Objekte. Der Wechsel auf eine
Datenquelle betrifft genau eine Ebene:

```ts
// heute
import { CATEGORIES } from "@/data/categories";

// spaeter
const categories = await loadCategories();   // fetch / DB / CMS
```

Weil `lib/catalog.ts` alle Zugriffe kapselt (`getIngredient`, `getGroup`,
`selectedIngredients`, …), muss kein Bildschirm angefasst werden. Empfohlen:
Server Components laden den Katalog, der Builder bekommt ihn als Prop.

Zwischenschritt ohne Datenbank: dieselben Objekte als JSON ausliefern und
mit `revalidate` zwischenspeichern.

## 2. Bestellungen

Benoetigte Endpunkte:

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `POST` | `/api/orders` | Bestellung anlegen, Preis **serverseitig** neu rechnen |
| `GET` | `/api/orders/:id` | Status abfragen (oder SSE/WebSocket) |
| `POST` | `/api/orders/:id/cancel` | Storno vor Zubereitungsbeginn |

Wichtig: Der Client-Preis ist ein Vorschlag. Der Server rechnet mit
derselben Funktion (`lib/pricing.ts`, `lib/totals.ts`) neu und lehnt
Abweichungen ab. Die Funktionen sind bewusst frei von React-Abhaengigkeiten,
damit sie in einer Route Handler-Umgebung laufen koennen.

Statuspflege: `ORDER_STATUS_FLOW` bleibt die Anzeige-Definition,
`lib/orders.ts` gibt `order.status` durch, sobald er vom Server kommt.

## 3. Zahlung

`lib/payment/provider.ts` implementieren:

```ts
export const stripeProvider: PaymentProvider = {
  id: "stripe",
  supports: (m) => ["card", "apple_pay", "google_pay"].includes(m),
  createIntent: async (req) => {
    const res = await fetch("/api/payments/intent", { method: "POST", body: JSON.stringify(req) });
    const { clientSecret } = await res.json();
    return { status: "requires_action", clientSecret };
  },
};
registerProvider(stripeProvider);
```

Der Geheimschluessel bleibt auf dem Server. Danach in `data/config.ts` die
betreffenden `PAYMENT_METHODS` auf `enabled: true` setzen.

## 4. Konten

`stores/account-store.ts` hat bereits die Bereiche eines Kundenkontos
(Bestellungen, Favoriten, Adressen, Profil). Beim Anschluss einer
Anmeldung wird die Persistenz getauscht — die Oberflaechen bleiben.
„Bestellen ohne Konto" muss moeglich bleiben; die Gastbestellung ist der
Normalfall, nicht die Ausnahme.

## 5. Adminbereich

Vorgesehene Bereiche (noch nicht gebaut, Datenmodell steht):

| Bereich | Bezug im Modell |
| --- | --- |
| Produkte anlegen/deaktivieren | `Product.available`, `Product.basePrice` |
| Preise aendern | `Product.basePrice`, `Ingredient.price`, `OptionItem.price` |
| Zutaten verwalten, „ausverkauft" | `Ingredient.available`, `unavailableReason` |
| Oeffnungszeiten und Ausnahmen | `OPENING_HOURS`, `OPENING_EXCEPTIONS` |
| Liefergebiete | `DELIVERY_ZONES` (PLZ, Mindestwert, Kosten, Dauer) |
| Gutscheine und Aktionen | `COUPONS` |
| Bestellungen und Status | `Order`, `ORDER_STATUS_FLOW` |

Da alle Felder bereits existieren und im UI ausgewertet werden, reduziert
sich der Adminbereich auf Formulare ueber demselben Modell. Ein „ausverkauft"
schaltet die Zutat live grau — dieser Weg ist im Builder schon gebaut und
laesst sich mit `dn-…`/`pz-…`-IDs testen (`available: false`).

## 6. Was der Server zusaetzlich pruefen muss

Alles, was `lib/validation.ts#preflight` clientseitig prueft, ist eine
Bequemlichkeit — verbindlich ist die Pruefung auf dem Server:

- Verfuegbarkeit aller Positionen
- Mindestbestellwert der Zone
- Adresse im Liefergebiet
- Betrieb geoeffnet oder gueltige Vorbestellzeit
- Pflichtgruppen vollstaendig (`missingRequirements`)
