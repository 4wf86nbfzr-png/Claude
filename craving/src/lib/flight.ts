/**
 * Position des Warenkorb-Symbols. Wird im Klick-Handler ermittelt (nicht
 * beim Rendern), damit die Flugbahn ohne zusaetzlichen Renderdurchlauf
 * feststeht. Je nach Viewport ist das Ziel die Kopfzeile oder die
 * Bottom-Navigation — beide tragen `data-cart-target`.
 */
export function cartTargetPoint(): { x: number; y: number } | null {
  if (typeof document === "undefined") return null;
  const nodes = [...document.querySelectorAll("[data-cart-target]")];
  const visible = nodes.find((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (!visible) return null;
  const rect = visible.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
