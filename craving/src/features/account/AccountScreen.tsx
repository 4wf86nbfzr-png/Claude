"use client";

import Link from "next/link";
import { Heart, MapPin, ReceiptText, Settings2, Ticket, User, Volume2, VolumeX } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHydrated } from "@/hooks/useHydrated";
import { COUPONS, PAYMENT_METHODS } from "@/data/config";
import { formatPrice } from "@/lib/format";
import { useAccountStore } from "@/stores/account-store";

/**
 * Konto ohne Konto: alles liegt im Geraet. Die Struktur entspricht bereits
 * den spaeteren Bereichen eines echten Kundenkontos, damit beim Anschluss
 * einer Anmeldung nur die Datenquelle wechselt.
 */
export function AccountScreen() {
  const hydrated = useHydrated();
  const orders = useAccountStore((s) => s.orders);
  const favorites = useAccountStore((s) => s.favorites);
  const addresses = useAccountStore((s) => s.addresses);
  const removeAddress = useAccountStore((s) => s.removeAddress);
  const customer = useAccountStore((s) => s.customer);
  const setCustomer = useAccountStore((s) => s.setCustomer);
  const soundEnabled = useAccountStore((s) => s.soundEnabled);
  const setSound = useAccountStore((s) => s.setSound);

  if (!hydrated) {
    return (
      <div className="shell space-y-4 pb-24 pt-28 lg:pt-36">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const tiles = [
    { href: "/bestellungen", icon: ReceiptText, label: "Bestellungen", value: `${orders.length}` },
    { href: "/konto/favoriten", icon: Heart, label: "Favoriten", value: `${favorites.length}` },
  ];

  return (
    <div className="shell pb-24 pt-28 lg:pt-36">
      <header>
        <p className="kicker">Dein Bereich</p>
        <h1 className="display display-l mt-2">Konto.</h1>
        <p className="lede mt-4">
          Bestellen geht ohne Anmeldung — und bleibt so. Was du hier siehst, ist in
          deinem Geraet gespeichert.
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ href, icon: Icon, label, value }) => (
          <Link key={href} href={href} className="card group flex items-center justify-between p-5 transition hover:border-line-strong">
            <span className="flex items-center gap-3">
              <Icon className="size-5 text-chrome" aria-hidden />
              <span className="text-sm font-semibold">{label}</span>
            </span>
            <span className="num text-2xl font-bold text-muted transition-colors group-hover:text-paper">{value}</span>
          </Link>
        ))}
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <section aria-labelledby="profil">
          <h2 id="profil" className="flex items-center gap-2 text-lg font-bold">
            <User className="size-[18px] text-chrome" aria-hidden />
            Profil
          </h2>
          <p className="mt-1 text-sm text-muted">Wird beim Bestellen vorausgefuellt.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Vorname" value={customer.firstName ?? ""} onChange={(v) => setCustomer({ firstName: v })} />
            <Field label="Nachname" value={customer.lastName ?? ""} onChange={(v) => setCustomer({ lastName: v })} />
            <Field label="E-Mail" type="email" value={customer.email ?? ""} onChange={(v) => setCustomer({ email: v })} />
            <Field label="Telefon" type="tel" value={customer.phone ?? ""} onChange={(v) => setCustomer({ phone: v })} />
          </div>
        </section>

        <section aria-labelledby="adressen">
          <h2 id="adressen" className="flex items-center gap-2 text-lg font-bold">
            <MapPin className="size-[18px] text-chrome" aria-hidden />
            Adressen
          </h2>
          {addresses.length === 0 ? (
            <p className="mt-3 rounded-xl border border-line bg-ink-2 p-5 text-sm text-muted">
              Noch keine Adresse gespeichert. Die erste Bestellung merkt sie sich.
            </p>
          ) : (
            <ul className="mt-5 space-y-2">
              {addresses.map((a, i) => (
                <li key={`${a.street}-${i}`} className="card flex items-start justify-between gap-4 p-4">
                  <address className="text-sm not-italic leading-relaxed text-chrome">
                    {a.street} {a.houseNumber}
                    <br />
                    {a.postalCode} {a.city}
                    {a.doorbell && <><br />Klingel: {a.doorbell}</>}
                  </address>
                  <button
                    type="button"
                    onClick={() => removeAddress(i)}
                    className="text-[0.8125rem] text-muted transition hover:text-danger"
                  >
                    Entfernen
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-10 flex items-center gap-2 text-lg font-bold">
            <Ticket className="size-[18px] text-chrome" aria-hidden />
            Gutscheine
          </h2>
          <ul className="mt-5 space-y-2">
            {COUPONS.filter((c) => c.active).map((c) => (
              <li key={c.code} className="card flex items-center justify-between gap-4 p-4">
                <span>
                  <span className="num block text-sm font-bold">{c.code}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {c.label}
                    {c.minSubtotal ? ` · ab ${formatPrice(c.minSubtotal)}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="zahlung">
          <h2 id="zahlung" className="flex items-center gap-2 text-lg font-bold">
            <Settings2 className="size-[18px] text-chrome" aria-hidden />
            Zahlungsmethoden
          </h2>
          <ul className="mt-5 space-y-2">
            {PAYMENT_METHODS.map((m) => (
              <li key={m.id} className="card flex items-center justify-between gap-4 p-4 text-sm">
                <span className={m.enabled ? "" : "text-muted"}>{m.label}</span>
                <span className="rounded-full bg-white/5 px-2.5 py-1 text-[0.625rem] font-medium text-muted">
                  {m.enabled ? "verfuegbar" : "in Vorbereitung"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="einstellungen">
          <h2 id="einstellungen" className="text-lg font-bold">
            Einstellungen
          </h2>
          <button
            type="button"
            onClick={() => setSound(!soundEnabled)}
            aria-pressed={soundEnabled}
            className="card mt-5 flex w-full items-center justify-between gap-4 p-4 text-left transition hover:border-line-strong"
          >
            <span className="flex items-center gap-3">
              {soundEnabled ? <Volume2 className="size-[18px] text-chrome" aria-hidden /> : <VolumeX className="size-[18px] text-muted" aria-hidden />}
              <span>
                <span className="block text-sm font-semibold">Bedien-Toene</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Dezente Rueckmeldung beim Bauen. Standard: aus.
                </span>
              </span>
            </span>
            <span
              className={`relative h-6 w-11 rounded-full transition-colors ${soundEnabled ? "bg-ember" : "bg-ink-4"}`}
              aria-hidden
            >
              <span
                className={`absolute top-1 size-4 rounded-full bg-paper transition-all ${soundEnabled ? "left-6" : "left-1"}`}
              />
            </span>
          </button>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Musik laeuft nie von selbst. Toene sind vorbereitet, aber standardmaessig
            abgeschaltet.
          </p>
        </section>
      </div>
    </div>
  );
}
