import { COUPONS } from "@/data/config";
import { deliveryFeeFor, findZone, minOrderFor } from "@/lib/delivery";
import type { CartItem, Cents, Coupon, Fulfillment, OrderTotals } from "@/types/domain";

export function subtotalOf(items: CartItem[]): Cents {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}

export function findCoupon(code: string): Coupon | undefined {
  const needle = code.trim().toUpperCase();
  return COUPONS.find((c) => c.code === needle && c.active);
}

export type CouponProblem = "unknown" | "min_subtotal" | "expired";

export function validateCoupon(code: string, subtotal: Cents): { coupon?: Coupon; problem?: CouponProblem } {
  const coupon = findCoupon(code);
  if (!coupon) return { problem: "unknown" };
  if (coupon.validUntil && new Date(coupon.validUntil).getTime() < Date.now()) {
    return { coupon, problem: "expired" };
  }
  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
    return { coupon, problem: "min_subtotal" };
  }
  return { coupon };
}

export interface TotalsInput {
  items: CartItem[];
  fulfillment: Fulfillment;
  postalCode?: string;
  couponCode?: string;
  /** Prozentwert (5, 10) oder absoluter Betrag in Cent, siehe tipIsAbsolute. */
  tipPercent?: number;
  tipAbsolute?: Cents;
}

export interface TotalsResult extends OrderTotals {
  minOrder: Cents;
  minOrderMet: boolean;
  missingForMinOrder: Cents;
  missingForFreeDelivery?: Cents;
  couponApplied?: Coupon;
  couponProblem?: CouponProblem;
}

export function computeTotals(input: TotalsInput): TotalsResult {
  const subtotal = subtotalOf(input.items);
  const zone = input.fulfillment === "delivery" ? findZone(input.postalCode ?? "") : undefined;

  let deliveryFee = input.fulfillment === "delivery" ? deliveryFeeFor(zone, subtotal) : 0;
  // Ohne bekannte PLZ zeigen wir die guenstigste Zone als Richtwert.
  if (input.fulfillment === "delivery" && !zone) deliveryFee = 0;

  let discount = 0;
  let couponApplied: Coupon | undefined;
  let couponProblem: CouponProblem | undefined;

  if (input.couponCode) {
    const { coupon, problem } = validateCoupon(input.couponCode, subtotal);
    couponProblem = problem;
    if (coupon && !problem) {
      couponApplied = coupon;
      if (coupon.kind === "percent") discount = Math.round((subtotal * coupon.value) / 100);
      else if (coupon.kind === "fixed") discount = Math.min(coupon.value, subtotal);
      else if (coupon.kind === "free_delivery") {
        discount = 0;
        deliveryFee = 0;
      }
    }
  }

  const tip =
    input.tipAbsolute !== undefined
      ? Math.max(0, Math.round(input.tipAbsolute))
      : Math.round(((subtotal - discount) * (input.tipPercent ?? 0)) / 100);

  const minOrder = input.fulfillment === "delivery" ? minOrderFor(zone) : 0;
  const missingForMinOrder = Math.max(0, minOrder - subtotal);

  const missingForFreeDelivery =
    input.fulfillment === "delivery" && zone?.freeFrom && subtotal < zone.freeFrom
      ? zone.freeFrom - subtotal
      : undefined;

  return {
    subtotal,
    discount,
    deliveryFee,
    tip,
    total: Math.max(0, subtotal - discount) + deliveryFee + tip,
    minOrder,
    minOrderMet: missingForMinOrder === 0,
    missingForMinOrder,
    missingForFreeDelivery,
    couponApplied,
    couponProblem,
  };
}
