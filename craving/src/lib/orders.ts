import { ORDER_STATUS_FLOW } from "@/data/config";
import type { Order, OrderStatus } from "@/types/domain";

/**
 * Bestellstatus.
 *
 * Solange kein Kuechensystem angebunden ist, leitet sich der Status aus der
 * verstrichenen Zeit ab (Demo). Die Signatur bleibt gleich, wenn spaeter ein
 * echter Status vom Server kommt: dann gewinnt `order.status`.
 */
export function statusFor(order: Order, now: number = Date.now()): OrderStatus {
  const minutes = (now - order.createdAt) / 60000;
  let current: OrderStatus = "received";
  for (const step of ORDER_STATUS_FLOW) {
    if (minutes >= step.afterMinutes) current = step.id;
  }
  // Abholung kennt keinen Fahrer — dort endet es beim Fertigstellen.
  if (order.fulfillment === "pickup" && (current === "on_the_way" || current === "nearby")) {
    return "cooking";
  }
  return current;
}

export function statusIndex(status: OrderStatus): number {
  return ORDER_STATUS_FLOW.findIndex((s) => s.id === status);
}

/** Verbleibende Minuten bis zur Lieferung (Demo-Schaetzung). */
export function minutesLeft(order: Order, now: number = Date.now()): number {
  const elapsed = (now - order.createdAt) / 60000;
  return Math.max(0, Math.round(order.etaMinutes - elapsed));
}

export function isFinished(order: Order, now: number = Date.now()): boolean {
  return statusFor(order, now) === "delivered";
}
