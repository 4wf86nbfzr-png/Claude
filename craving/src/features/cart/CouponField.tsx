"use client";

import { useState } from "react";
import { BadgePercent, Check, X } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";
import type { TotalsResult } from "@/lib/totals";

const MESSAGES: Record<string, string> = {
  unknown: "Diesen Code kennen wir nicht.",
  expired: "Der Code ist abgelaufen.",
  min_subtotal: "Der Mindestbestellwert fuer diesen Code ist noch nicht erreicht.",
};

export function CouponField({ totals }: { totals: TotalsResult }) {
  const couponCode = useCartStore((s) => s.couponCode);
  const setCoupon = useCartStore((s) => s.setCoupon);
  const [draft, setDraft] = useState(couponCode);

  const applied = totals.couponApplied && !totals.couponProblem;

  return (
    <div>
      <p className="kicker mb-3">Gutschein</p>
      {applied ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-basil/30 bg-basil/8 p-3.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Check className="size-4 text-basil" aria-hidden />
            {totals.couponApplied?.label}
          </span>
          <button
            type="button"
            onClick={() => {
              setCoupon("");
              setDraft("");
            }}
            className="grid size-8 place-items-center rounded-full text-muted transition hover:bg-white/5 hover:text-paper"
            aria-label="Gutschein entfernen"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCoupon(draft.trim().toUpperCase());
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <BadgePercent className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.toUpperCase())}
              placeholder="Code eingeben"
              aria-label="Gutscheincode"
              className="w-full rounded-xl border border-line bg-ink py-3 pl-10 pr-3 text-sm uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal placeholder:text-muted focus:border-line-strong focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl border border-line bg-ink-3 px-4 text-sm font-semibold transition hover:bg-ink-4"
          >
            Einloesen
          </button>
        </form>
      )}
      {couponCode && totals.couponProblem && (
        <p className="mt-2 text-[0.8125rem] text-danger" role="status">
          {MESSAGES[totals.couponProblem] ?? "Der Code kann nicht eingeloest werden."}
        </p>
      )}
    </div>
  );
}
