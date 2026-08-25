"use client";

import { AnimatedPrice } from "@/components/ui/Price";
import { formatPrice } from "@/lib/format";
import type { TotalsResult } from "@/lib/totals";
import type { Fulfillment } from "@/types/domain";

export function CartTotals({ totals, fulfillment }: { totals: TotalsResult; fulfillment: Fulfillment }) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-muted">Zwischensumme</dt>
        <dd className="num">{formatPrice(totals.subtotal)}</dd>
      </div>

      {totals.discount > 0 && (
        <div className="flex justify-between gap-4 text-basil">
          <dt>Rabatt</dt>
          <dd className="num">−{formatPrice(totals.discount)}</dd>
        </div>
      )}

      {fulfillment === "delivery" && (
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Lieferung</dt>
          <dd className="num">{totals.deliveryFee === 0 ? "geschenkt" : formatPrice(totals.deliveryFee)}</dd>
        </div>
      )}

      {totals.tip > 0 && (
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Trinkgeld</dt>
          <dd className="num">{formatPrice(totals.tip)}</dd>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
        <dt className="text-base font-semibold">Gesamt</dt>
        <dd>
          <AnimatedPrice value={totals.total} className="text-2xl font-bold" />
        </dd>
      </div>

      <p className="pt-1 text-[0.6875rem] text-muted">Alle Preise inkl. MwSt.</p>
    </dl>
  );
}

/** Fortschritt bis Mindestbestellwert bzw. kostenfreier Lieferung. */
export function CartProgress({ totals }: { totals: TotalsResult }) {
  if (totals.minOrder > 0 && !totals.minOrderMet) {
    const ratio = Math.min(1, totals.subtotal / totals.minOrder);
    return (
      <div className="rounded-xl border border-saffron/25 bg-saffron/8 p-4">
        <p className="text-[0.8125rem] font-medium text-saffron">
          Noch {formatPrice(totals.missingForMinOrder)} bis zum Mindestbestellwert.
        </p>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-saffron transition-[width] duration-500"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (totals.missingForFreeDelivery) {
    return (
      <p className="rounded-xl border border-line bg-ink-3 p-4 text-[0.8125rem] text-chrome">
        Noch {formatPrice(totals.missingForFreeDelivery)} und die Lieferung geht auf uns.
      </p>
    );
  }

  return null;
}
