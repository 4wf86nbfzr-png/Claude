"use client";

import { motion } from "framer-motion";
import { Bike, Store } from "lucide-react";
import { findZone, servedPostalCodes } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/stores/cart-store";

/**
 * Lieferung oder Abholung — und bei Lieferung sofort die PLZ, weil
 * Mindestbestellwert und Lieferkosten davon abhaengen. Lieber hier fragen
 * als den Kunden im Checkout ueberraschen.
 */
export function FulfillmentSwitch() {
  const fulfillment = useCartStore((s) => s.fulfillment);
  const setFulfillment = useCartStore((s) => s.setFulfillment);
  const postalCode = useCartStore((s) => s.postalCode);
  const setPostalCode = useCartStore((s) => s.setPostalCode);
  const zone = findZone(postalCode);
  const known = servedPostalCodes();

  return (
    <div className="card p-5">
      <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-ink p-1">
        {(
          [
            { id: "delivery", label: "Lieferung", icon: Bike },
            { id: "pickup", label: "Abholung", icon: Store },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = fulfillment === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFulfillment(id)}
              aria-pressed={active}
              className={`relative flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors ${
                active ? "text-black" : "text-muted hover:text-paper"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="fulfillment-pill"
                  className="absolute inset-0 rounded-full bg-paper"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon className="size-4" aria-hidden />
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {fulfillment === "delivery" ? (
        <div className="mt-4">
          <label htmlFor="cart-plz" className="kicker">
            Liefer-PLZ
          </label>
          <input
            id="cart-plz"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="z. B. 20095"
            list="plz-liste"
            className="mt-2 w-full rounded-xl border border-line bg-ink p-3.5 text-sm placeholder:text-muted focus:border-line-strong focus:outline-none"
          />
          <datalist id="plz-liste">
            {known.map((plz) => (
              <option key={plz} value={plz} />
            ))}
          </datalist>

          {postalCode.length === 5 && !zone && (
            <p className="mt-2 text-[0.8125rem] text-danger">
              Dorthin liefern wir nicht — Abholung geht aber jederzeit.
            </p>
          )}
          {zone && (
            <p className="mt-2 text-[0.8125rem] text-muted">
              {zone.label} · ab {formatPrice(zone.minOrder)} · {formatPrice(zone.fee)} Lieferung
              {zone.freeFrom ? ` (ab ${formatPrice(zone.freeFrom)} kostenlos)` : ""} · ca. {zone.etaMinutes} Min.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-[0.8125rem] text-muted">
          Abholung: in der Regel in 15 Minuten fertig. Kein Mindestbestellwert.
        </p>
      )}
    </div>
  );
}
