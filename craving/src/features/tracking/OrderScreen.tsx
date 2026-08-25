"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { PackageSearch, Phone, RotateCcw } from "lucide-react";
import { OrderTimeline } from "./OrderTimeline";
import { useReorder } from "./useReorder";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHydrated } from "@/hooks/useHydrated";
import { BRAND } from "@/data/config";
import { formatMinutes, formatPrice, formatTime } from "@/lib/format";
import { minutesLeft, statusFor } from "@/lib/orders";
import { rendererFor } from "@/features/builder/renderers";
import { getCategory, selectedIngredients, optionEffects } from "@/lib/catalog";
import { useAccountStore } from "@/stores/account-store";

/** Erfolgsmoment nach der Bestellung — kurz, laut, dann aus dem Weg. */
function SuccessBanner({ orderId, eta }: { orderId: string; eta: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-[26px] border border-line bg-ink-2 p-8 lg:p-12"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(70% 60% at 20% 0%, rgba(255,90,31,0.16), transparent 70%)" }}
      />
      <div className="relative">
        <p className="kicker">Bestaetigt</p>
        <h1 className="display display-l mt-2">Order locked in.</h1>
        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <p className="kicker">Nummer</p>
            <p className="num mt-1 text-xl font-bold">{orderId}</p>
          </div>
          <div>
            <p className="kicker">Voraussichtlich</p>
            <p className="num mt-1 text-xl font-bold">{formatMinutes(eta)}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function OrderScreen({ orderId }: { orderId: string }) {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const isNew = params.get("neu") === "1";
  const orders = useAccountStore((s) => s.orders);
  const reorder = useReorder();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const order = orders.find((o) => o.id === orderId);

  if (!hydrated) {
    return (
      <div className="shell space-y-4 pb-24 pt-28 lg:pt-36">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="pt-24 lg:pt-32">
        <EmptyState
          icon={PackageSearch}
          kicker={orderId}
          title="Diese Bestellung kennen wir nicht."
          description="Bestellungen liegen im Geraet, mit dem sie aufgegeben wurden. Auf einem anderen Telefon oder nach dem Leeren des Browserspeichers sind sie hier nicht sichtbar."
          actionLabel="Zu den Bestellungen"
          actionHref="/bestellungen"
        />
      </div>
    );
  }

  const status = statusFor(order, now);
  const left = minutesLeft(order, now);
  const category = getCategory(order.items[0]?.categoryId ?? "");
  const Renderer = category && !category.simple ? rendererFor(category.id) : null;
  const firstSelections = order.items[0]?.selections ?? {};

  return (
    <div className="shell pb-24 pt-28 lg:pt-36">
      {isNew && <SuccessBanner orderId={order.id} eta={order.etaMinutes} />}

      <div className={`grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16 ${isNew ? "mt-12" : ""}`}>
        <div>
          {!isNew && (
            <header className="mb-8">
              <p className="kicker">Bestellung {order.id}</p>
              <h1 className="display display-l mt-2">
                {status === "delivered" ? "Guten Appetit." : "Unterwegs zu dir."}
              </h1>
            </header>
          )}

          <div className="card p-6">
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-5">
              <div>
                <p className="kicker">{order.fulfillment === "delivery" ? "Lieferung" : "Abholung"}</p>
                <p className="mt-1 text-lg font-semibold">
                  {status === "delivered"
                    ? "Zugestellt"
                    : left > 0
                      ? `in etwa ${formatMinutes(left)}`
                      : "jeden Moment"}
                </p>
              </div>
              <p className="num text-sm text-muted">
                Bestellt {formatTime(new Date(order.createdAt))} Uhr
              </p>
            </div>

            <OrderTimeline status={status} pickup={order.fulfillment === "pickup"} />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="quiet" onClick={() => reorder(order.items)}>
              <RotateCcw className="size-4" aria-hidden />
              Nochmal bestellen
            </Button>
            <ButtonLink variant="outline" href="/menue">
              Etwas anderes bauen
            </ButtonLink>
          </div>

          <p className="mt-6 flex items-center gap-2 text-[0.8125rem] text-muted">
            <Phone className="size-4" aria-hidden />
            Etwas stimmt nicht? Ruf uns an: {BRAND.phone}
          </p>
        </div>

        <aside className="space-y-6">
          {Renderer && (
            <div className="card relative overflow-hidden p-6">
              <div className="mx-auto aspect-square w-full max-w-[18rem]">
                <Renderer
                  ingredients={category ? selectedIngredients(category, firstSelections) : []}
                  effects={category ? optionEffects(category, firstSelections) : { sizeScale: 1, spice: 0, variants: [] }}
                  label={order.items[0]?.name ?? "Bestellung"}
                />
              </div>
            </div>
          )}

          <div className="card p-6">
            <h2 className="kicker mb-4">Bestellung</h2>
            <ul className="space-y-3">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 text-sm">
                  <span className="text-chrome">
                    <span className="num text-muted">{item.quantity}×</span> {item.name}
                  </span>
                  <span className="num">{formatPrice(item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-1.5 border-t border-line pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Zwischensumme</dt>
                <dd className="num">{formatPrice(order.totals.subtotal)}</dd>
              </div>
              {order.totals.deliveryFee > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Lieferung</dt>
                  <dd className="num">{formatPrice(order.totals.deliveryFee)}</dd>
                </div>
              )}
              {order.totals.tip > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Trinkgeld</dt>
                  <dd className="num">{formatPrice(order.totals.tip)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-line pt-2 text-base font-semibold">
                <dt>Gesamt</dt>
                <dd className="num">{formatPrice(order.totals.total)}</dd>
              </div>
            </dl>
          </div>

          {order.address && (
            <div className="card p-6">
              <h2 className="kicker mb-3">Adresse</h2>
              <address className="text-sm not-italic leading-relaxed text-chrome">
                {order.customer.firstName} {order.customer.lastName}
                <br />
                {order.address.street} {order.address.houseNumber}
                <br />
                {order.address.postalCode} {order.address.city}
              </address>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted">
            Testbetrieb: Der Status ist eine Demo-Simulation und kommt noch nicht aus
            der Kueche. <Link href="/rechtliches/agb" className="underline">Mehr dazu</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
