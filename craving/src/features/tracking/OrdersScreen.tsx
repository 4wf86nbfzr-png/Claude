"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReceiptText, RotateCcw } from "lucide-react";
import { useReorder } from "./useReorder";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHydrated } from "@/hooks/useHydrated";
import { ORDER_STATUS_FLOW } from "@/data/config";
import { formatDateTime, formatPrice } from "@/lib/format";
import { statusFor } from "@/lib/orders";
import { useAccountStore } from "@/stores/account-store";

export function OrdersScreen() {
  const hydrated = useHydrated();
  const orders = useAccountStore((s) => s.orders);
  const reorder = useReorder();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!hydrated) {
    return (
      <div className="shell space-y-3 pb-24 pt-28 lg:pt-36">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="pt-24 lg:pt-32">
        <EmptyState
          icon={ReceiptText}
          kicker="Noch nichts bestellt"
          title="Hier wird es bald voll."
          description="Sobald du bestellt hast, findest du hier den Status und kannst mit einem Tippen dieselbe Bestellung wiederholen."
          actionLabel="Zum Menue"
          actionHref="/menue"
        />
      </div>
    );
  }

  return (
    <div className="shell pb-24 pt-28 lg:pt-36">
      <header>
        <p className="kicker">Deine Bestellungen</p>
        <h1 className="display display-l mt-2">Was du hattest.</h1>
        <p className="lede mt-4">
          Bestellungen liegen lokal in diesem Geraet. Mit einem spaeteren Konto
          folgen sie dir auf jedes Geraet.
        </p>
      </header>

      <ul className="mt-10 border-t border-line">
        {orders.map((order) => {
          const status = statusFor(order, now);
          const label = ORDER_STATUS_FLOW.find((s) => s.id === status)?.label ?? "";
          const live = status !== "delivered";
          return (
            <li key={order.id} className="border-b border-line py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/bestellungen/${order.id}`} className="num text-lg font-bold hover:underline">
                      {order.id}
                    </Link>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${
                        live ? "bg-ember/12 text-ember" : "bg-white/5 text-muted"
                      }`}
                    >
                      {live && <span className="size-1.5 rounded-full bg-ember" aria-hidden />}
                      {label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-muted">
                    {formatDateTime(new Date(order.createdAt))} Uhr ·{" "}
                    {order.fulfillment === "delivery" ? "Lieferung" : "Abholung"}
                  </p>
                  <p className="mt-2 text-sm text-chrome">
                    {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="num text-lg font-semibold">{formatPrice(order.totals.total)}</span>
                  <div className="flex gap-2">
                    <Button variant="quiet" size="sm" onClick={() => reorder(order.items)}>
                      <RotateCcw className="size-3.5" aria-hidden />
                      Nochmal
                    </Button>
                    <Link
                      href={`/bestellungen/${order.id}`}
                      className="inline-flex h-9 items-center rounded-full border border-line px-4 text-[0.8125rem] font-semibold transition hover:border-line-strong"
                    >
                      Status
                    </Link>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
