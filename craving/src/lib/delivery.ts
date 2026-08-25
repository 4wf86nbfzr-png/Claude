import { DELIVERY_ZONES, PICKUP_ETA_MINUTES } from "@/data/config";
import type { Cents, DeliveryZone, Fulfillment } from "@/types/domain";

export function findZone(postalCode: string): DeliveryZone | undefined {
  const plz = postalCode.trim();
  return DELIVERY_ZONES.find((z) => z.postalCodes.includes(plz));
}

export function deliveryFeeFor(zone: DeliveryZone | undefined, subtotal: Cents): Cents {
  if (!zone) return 0;
  if (zone.freeFrom !== undefined && subtotal >= zone.freeFrom) return 0;
  return zone.fee;
}

export function minOrderFor(zone: DeliveryZone | undefined): Cents {
  return zone?.minOrder ?? 0;
}

export function etaFor(fulfillment: Fulfillment, zone?: DeliveryZone): number {
  if (fulfillment === "pickup") return PICKUP_ETA_MINUTES;
  return zone?.etaMinutes ?? 45;
}

/** Alle belieferten PLZ — fuer Autovervollstaendigung und die Gebietsliste. */
export function servedPostalCodes(): string[] {
  return DELIVERY_ZONES.flatMap((z) => z.postalCodes).sort();
}
