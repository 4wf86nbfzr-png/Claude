/**
 * IDs nur im Browser erzeugen (Klick-Handler), nie beim Rendern —
 * sonst laufen Server- und Client-Markup auseinander.
 */
export function uid(prefix = "id"): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

/** Menschenlesbare Bestellnummer: "CR-4F82" */
export function orderNumber(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `CR-${out}`;
}
