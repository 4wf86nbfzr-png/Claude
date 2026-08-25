/**
 * Domaenenmodell fuer CRAVING.
 *
 * Grundsatz: Alles, was das UI anzeigt, kommt aus diesen Strukturen.
 * Preise sind IMMER Cent (ganzzahlig) — nie Fliesskomma, nie im UI hartkodiert.
 */

/** Preis in Cent. 950 === 9,50 EUR */
export type Cents = number;

/* ------------------------------------------------------------------ *
 * Allergene / Zusatzstoffe (Kennzeichnungspflicht, LMIV)
 * ------------------------------------------------------------------ */

export type AllergenCode =
  | "gluten" | "krebstiere" | "ei" | "fisch" | "erdnuss" | "soja"
  | "milch" | "schalenfruechte" | "sellerie" | "senf" | "sesam"
  | "sulfite" | "lupine" | "weichtiere";

export interface Allergen {
  code: AllergenCode;
  label: string;
  note?: string;
}

export interface Additive {
  code: string;   // z. B. "1" = mit Farbstoff
  label: string;
}

export interface Nutrition {
  /** Beitrag einer Portion dieser Zutat */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/* ------------------------------------------------------------------ *
 * Visuelle Ebenen des Food Builders
 * ------------------------------------------------------------------ */

/**
 * Geometrische Grundform einer Zutatenebene. Der prozedurale Renderer
 * leitet daraus Verteilung, Silhouette und Schattierung ab.
 * Sobald echte Foto-Layer vorliegen, uebernimmt `sprite` die Ebene.
 */
export type LayerShape =
  | "base"      // Teig, Brot, Fladen — traegt alles andere
  | "sauce"     // fliessend, deckend, unregelmaessige Kante
  | "spread"    // gestrichen (Tomatensosse, Remoulade)
  | "sheet"     // flaechig (Kaese, Schinkenscheibe)
  | "slice"     // runde Scheiben (Salami, Tomate, Gurke)
  | "ring"      // Ringe (Zwiebel, Jalapeno, Paprika)
  | "shred"     // geraspelt/geschnitten (Salat, Kraut, Fleischstreifen)
  | "dice"      // gewuerfelt (Mais, Feta)
  | "leaf"      // Blaetter (Rucola, Basilikum)
  | "strip";    // Streifen (Fleisch vom Spiess, Bacon)

export interface IngredientVisual {
  /** Stapelreihenfolge: klein = unten. */
  z: number;
  shape: LayerShape;
  /** [Grundton, Schatten, Glanz, optional Sprenkel] */
  palette: string[];
  /** Mengenfaktor fuer die prozedurale Verteilung (1 = normal). */
  density?: number;
  /** Groessenfaktor der Einzelstuecke. */
  scale?: number;
  /** Wo die Ebene sitzt — beim Doener innen im Brot, beim Croque aussen. */
  slot?: "inside" | "outside" | "top";
  /**
   * Optionale Fotoebene. Ist `sprite` gesetzt UND die Datei vorhanden,
   * ersetzt sie die prozedurale Darstellung (siehe docs/ASSETS.md).
   */
  sprite?: { src: string; width: number; height: number };
}

/* ------------------------------------------------------------------ *
 * Auswaehlbare Bausteine
 * ------------------------------------------------------------------ */

export interface Choice {
  id: string;
  name: string;
  description?: string;
  /** Aufpreis in Cent. 0 = im Grundpreis enthalten. */
  price: Cents;
  /** Live schaltbar — ausverkaufte Zutaten bleiben sichtbar, aber gesperrt. */
  available: boolean;
  /** Grund der Sperre, z. B. "Heute ausverkauft" */
  unavailableReason?: string;
}

export interface Ingredient extends Choice {
  visual: IngredientVisual;
  allergens: AllergenCode[];
  additives?: string[];
  nutrition?: Nutrition;
  tags?: Array<"vegan" | "vegetarisch" | "scharf" | "halal" | "beliebt" | "neu">;
}

/** Effekt einer Option auf Preis und Darstellung. */
export interface OptionEffect {
  /** Skaliert die Produktvisualisierung (Pizzagroesse, Doenergroesse). */
  sizeScale?: number;
  /** Multiplikator auf alle Belag-Aufpreise (grosse Pizza = teurere Extras). */
  toppingPriceFactor?: number;
  /** Variante der Basisebene, vom Renderer ausgewertet. */
  baseVariant?: string;
  /** Schaerfegrad 0–3, steuert Chili-Partikel & Hinweis. */
  spice?: number;
}

export interface OptionItem extends Choice {
  effect?: OptionEffect;
}

/* ------------------------------------------------------------------ *
 * Builder: Gruppen und Schritte
 * ------------------------------------------------------------------ */

export type GroupKind = "option" | "ingredient";
export type SelectionMode = "single" | "multiple";

export interface ChoiceGroup {
  id: string;
  label: string;
  /** Kurzer Hinweis unter dem Gruppentitel. */
  hint?: string;
  kind: GroupKind;
  selection: SelectionMode;
  /** Mindestauswahl — >0 macht die Gruppe zur Pflicht. */
  min?: number;
  /** Hoechstauswahl (z. B. 3 Sossen). */
  max?: number;
  memberIds: string[];
  /** Vorauswahl beim Start eines Builders. */
  defaultIds?: string[];
  /** Vom Nutzer abwaehlbar, obwohl Teil der Basis (z. B. Tomatensosse). */
  removable?: boolean;
}

export interface BuilderStep {
  id: string;
  label: string;
  kicker?: string;
  groupIds: string[];
}

export interface BuilderConfig {
  steps: BuilderStep[];
  groups: ChoiceGroup[];
}

/* ------------------------------------------------------------------ *
 * Katalog
 * ------------------------------------------------------------------ */

export interface Category {
  id: string;            // "doener" | "pizza" | "croque" | spaeter mehr
  slug: string;
  name: string;
  headline: string;      // grosse Editorial-Zeile
  claim: string;
  description: string;
  accent: string;        // Akzentfarbe der Kategorie (CSS-Farbe)
  available: boolean;
  /** Reihenfolge in Menue und Startseite. */
  order: number;
  /** true = Beilage/Getraenk ohne Builder (nur Klick auf "Hinzufuegen"). */
  simple?: boolean;
  builder: BuilderConfig;
}

export interface Product {
  id: string;
  slug: string;
  categoryId: string;
  name: string;
  description: string;
  /** Grundpreis ohne Optionen/Extras. */
  basePrice: Cents;
  available: boolean;
  /** Vorbelegung des Builders: Gruppen-ID -> gewaehlte Mitglieder. */
  preset: Record<string, string[]>;
  badges?: string[];
  /** true = "Create Your Own", startet leer/minimal. */
  freestyle?: boolean;
  popularity?: number;
}

/* ------------------------------------------------------------------ *
 * Warenkorb
 * ------------------------------------------------------------------ */

/** Gruppen-ID -> IDs der gewaehlten Mitglieder. */
export type Selections = Record<string, string[]>;

export interface CartItem {
  /** Eigene ID der Zeile (nicht die Produkt-ID). */
  id: string;
  productId: string;
  categoryId: string;
  name: string;
  quantity: number;
  /** Einzelpreis inkl. aller Optionen und Extras. */
  unitPrice: Cents;
  selections: Selections;
  /** Gegenueber dem Produkt-Preset zusaetzlich gewaehlt. */
  added: string[];
  /** Gegenueber dem Produkt-Preset abgewaehlt. */
  removed: string[];
  note?: string;
  createdAt: number;
}

export interface SavedBuild {
  id: string;
  label: string;          // "Martins Doener"
  productId: string;
  categoryId: string;
  selections: Selections;
  createdAt: number;
}

/* ------------------------------------------------------------------ *
 * Lieferung, Zeiten, Rabatte
 * ------------------------------------------------------------------ */

export type Fulfillment = "delivery" | "pickup";

export interface DeliveryZone {
  id: string;
  label: string;
  postalCodes: string[];
  minOrder: Cents;
  fee: Cents;
  /** Ab dieser Zwischensumme entfaellt die Liefergebuehr. */
  freeFrom?: Cents;
  etaMinutes: number;
}

/** 0 = Sonntag … 6 = Samstag (wie Date#getDay) */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface OpeningRange {
  /** "11:00" */
  from: string;
  /** "23:00" — kleiner als `from` bedeutet ueber Mitternacht. */
  to: string;
}

export type OpeningHours = Record<Weekday, OpeningRange[]>;

export interface Coupon {
  code: string;
  label: string;
  kind: "percent" | "fixed" | "free_delivery";
  /** percent: 10 = 10 %; fixed: Cent */
  value: number;
  minSubtotal?: Cents;
  validUntil?: string;   // ISO-Datum
  active: boolean;
}

/* ------------------------------------------------------------------ *
 * Kunde, Adresse, Bestellung
 * ------------------------------------------------------------------ */

export interface Address {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  floor?: string;
  doorbell?: string;
  driverNote?: string;
}

export interface Customer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export type PaymentMethodId =
  | "apple_pay" | "google_pay" | "paypal" | "card"
  | "card_on_delivery" | "cash_on_delivery" | "cash_on_pickup";

export interface PaymentMethod {
  id: PaymentMethodId;
  label: string;
  hint?: string;
  /** Nur fuer diese Abwicklungsart anbieten. */
  fulfillment?: Fulfillment[];
  /** false = im Testbetrieb sichtbar, aber nicht waehlbar. */
  enabled: boolean;
}

export type OrderStatus =
  | "received" | "preparing" | "cooking" | "on_the_way" | "nearby" | "delivered";

export interface OrderTotals {
  subtotal: Cents;
  discount: Cents;
  deliveryFee: Cents;
  tip: Cents;
  total: Cents;
}

export interface Order {
  id: string;             // "CR-8421"
  createdAt: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  /** "asap" oder ISO-Zeit einer Vorbestellung. */
  scheduledFor: "asap" | string;
  items: CartItem[];
  totals: OrderTotals;
  customer: Customer;
  address?: Address;
  payment: PaymentMethodId;
  couponCode?: string;
  etaMinutes: number;
}

/* ------------------------------------------------------------------ *
 * Empfehlungen / Menues
 * ------------------------------------------------------------------ */

export interface Recommendation {
  id: string;
  title: string;          // "Passt perfekt dazu"
  /** Zeigen, wenn eine dieser Kategorien im Warenkorb liegt (leer = immer). */
  whenCategories: string[];
  productIds: string[];
}

export interface MenuDeal {
  id: string;
  name: string;
  description: string;
  /** Produkte, die das Menue ausmachen. */
  productIds: string[];
  /** Ersparnis gegenueber Einzelkauf. */
  saving: Cents;
  price: Cents;
  available: boolean;
}
