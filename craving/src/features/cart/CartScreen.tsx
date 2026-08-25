"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { CartLine } from "./CartLine";
import { CartProgress, CartTotals } from "./CartTotals";
import { CouponField } from "./CouponField";
import { FulfillmentSwitch } from "./FulfillmentSwitch";
import { Recommendations } from "./Recommendations";
import { TipSelector } from "./TipSelector";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHydrated } from "@/hooks/useHydrated";
import { computeTotals } from "@/lib/totals";
import { preflight } from "@/lib/validation";
import { useCartStore } from "@/stores/cart-store";

export function CartScreen() {
  const hydrated = useHydrated();
  const items = useCartStore((s) => s.items);
  const fulfillment = useCartStore((s) => s.fulfillment);
  const postalCode = useCartStore((s) => s.postalCode);
  const couponCode = useCartStore((s) => s.couponCode);
  const tipPercent = useCartStore((s) => s.tipPercent);
  const tipAbsolute = useCartStore((s) => s.tipAbsolute);

  const totals = useMemo(
    () => computeTotals({ items, fulfillment, postalCode, couponCode, tipPercent, tipAbsolute }),
    [items, fulfillment, postalCode, couponCode, tipPercent, tipAbsolute],
  );

  const issues = useMemo(
    () =>
      preflight({
        items,
        fulfillment,
        postalCode,
        minOrderMet: totals.minOrderMet,
        missingForMinOrder: totals.missingForMinOrder,
        allowPreorder: true,
      }),
    [items, fulfillment, postalCode, totals.minOrderMet, totals.missingForMinOrder],
  );

  const soldOutIds = issues.find((i) => i.code === "sold_out")?.itemIds ?? [];
  const blocking = issues.filter((i) => i.code !== "closed");
  const canCheckout = items.length > 0 && blocking.length === 0;

  if (!hydrated) {
    return (
      <div className="shell grid gap-10 pb-24 pt-28 lg:grid-cols-[1.6fr_1fr] lg:pt-36">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="pt-24 lg:pt-32">
        <EmptyState
          icon={ShoppingBag}
          kicker="Noch nichts drin"
          title="Der Korb ist leer."
          description="Kein Problem. Drei Baustellen warten — such dir eine aus."
          actionLabel="Jetzt bauen"
          actionHref="/bauen"
        />
      </div>
    );
  }

  return (
    <div className="shell pb-32 pt-28 lg:pb-24 lg:pt-36">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Dein Korb</p>
          <h1 className="display display-l mt-2">Fast fertig.</h1>
        </div>
        <Link href="/menue" className="text-sm text-muted transition-colors hover:text-paper">
          Weiter stoebern
        </Link>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)] lg:gap-14">
        <div>
          <ul className="border-t border-line">
            <AnimatePresence initial={false}>
              {items.map((item, index) => (
                <CartLine
                  key={item.id}
                  item={item}
                  flagged={soldOutIds.includes(item.id)}
                  showSwipeHint={index === 0}
                />
              ))}
            </AnimatePresence>
          </ul>

          <div className="mt-10">
            <Recommendations cartCategories={items.map((i) => i.categoryId)} />
          </div>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
          <FulfillmentSwitch />
          <CartProgress totals={totals} />

          <div className="card space-y-6 p-5">
            <CouponField totals={totals} />
            <TipSelector base={totals.subtotal - totals.discount} />
            <div className="border-t border-line pt-5">
              <CartTotals totals={totals} fulfillment={fulfillment} />
            </div>

            {blocking.length > 0 && (
              <ul className="space-y-1.5" role="status">
                {blocking.map((issue) => (
                  <li key={issue.code} className="text-[0.8125rem] text-saffron">
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}

            <ButtonLink
              href="/kasse"
              size="lg"
              className={`w-full ${canCheckout ? "" : "pointer-events-none opacity-40"}`}
              aria-disabled={!canCheckout}
              tabIndex={canCheckout ? undefined : -1}
            >
              Zur Kasse
              <ArrowRight className="size-[18px]" aria-hidden />
            </ButtonLink>
          </div>
        </aside>
      </div>
    </div>
  );
}
