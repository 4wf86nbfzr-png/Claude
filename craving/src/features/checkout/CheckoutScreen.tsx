"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Bike, Clock, CreditCard, Store, Zap } from "lucide-react";
import { StepIndicator } from "./StepIndicator";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { CartTotals } from "@/features/cart/CartTotals";
import { useHydrated } from "@/hooks/useHydrated";
import { PAYMENT_METHODS } from "@/data/config";
import { formatPrice, formatTime } from "@/lib/format";
import { etaFor, findZone } from "@/lib/delivery";
import { orderNumber } from "@/lib/id";
import { openingState, pickupSlots } from "@/lib/opening";
import { createPaymentIntent, paymentMethodsFor } from "@/lib/payment/provider";
import { computeTotals } from "@/lib/totals";
import { hasErrors, preflight, validateAddress, validateCustomer } from "@/lib/validation";
import { useAccountStore } from "@/stores/account-store";
import { useCartStore } from "@/stores/cart-store";
import { useUiStore } from "@/stores/ui-store";
import type { Address, Customer, Order, PaymentMethodId } from "@/types/domain";
import { ShoppingBag } from "lucide-react";

const STEPS = ["Lieferung", "Kontakt", "Zahlung", "Pruefen"];

export function CheckoutScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const items = useCartStore((s) => s.items);
  const fulfillment = useCartStore((s) => s.fulfillment);
  const setFulfillment = useCartStore((s) => s.setFulfillment);
  const postalCode = useCartStore((s) => s.postalCode);
  const setPostalCode = useCartStore((s) => s.setPostalCode);
  const couponCode = useCartStore((s) => s.couponCode);
  const tipPercent = useCartStore((s) => s.tipPercent);
  const tipAbsolute = useCartStore((s) => s.tipAbsolute);
  const clear = useCartStore((s) => s.clear);

  const storedCustomer = useAccountStore((s) => s.customer);
  const addresses = useAccountStore((s) => s.addresses);
  const setCustomer = useAccountStore((s) => s.setCustomer);
  const saveAddress = useAccountStore((s) => s.saveAddress);
  const addOrder = useAccountStore((s) => s.addOrder);
  const toast = useUiStore((s) => s.toast);

  const [customer, setLocalCustomer] = useState<Partial<Customer>>(storedCustomer);
  const [address, setAddress] = useState<Partial<Address>>({ postalCode });
  const [timing, setTiming] = useState<"asap" | string>("asap");
  const [payment, setPayment] = useState<PaymentMethodId | null>(null);
  const [touched, setTouched] = useState(false);
  const [paymentNote, setPaymentNote] = useState<string | null>(null);

  const totals = useMemo(
    () =>
      computeTotals({
        items,
        fulfillment,
        postalCode: address.postalCode ?? postalCode,
        couponCode,
        tipPercent,
        tipAbsolute,
      }),
    [items, fulfillment, address.postalCode, postalCode, couponCode, tipPercent, tipAbsolute],
  );

  const customerErrors = validateCustomer(customer);
  const addressErrors = fulfillment === "delivery" ? validateAddress(address) : {};
  const slots = useMemo(() => pickupSlots(new Date(), fulfillment === "pickup" ? 20 : 40, 10), [fulfillment]);
  const open = openingState(new Date());
  const methods = paymentMethodsFor(fulfillment);

  const issues = preflight({
    items,
    fulfillment,
    postalCode: address.postalCode ?? postalCode,
    minOrderMet: totals.minOrderMet,
    missingForMinOrder: totals.missingForMinOrder,
    allowPreorder: timing !== "asap",
  });
  const blocking = issues.filter((i) => i.code !== "closed" || timing === "asap");

  if (!hydrated) {
    return (
      <div className="shell space-y-4 pb-24 pt-28 lg:pt-36">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="pt-24 lg:pt-32">
        <EmptyState
          icon={ShoppingBag}
          kicker="Nichts zu bezahlen"
          title="Der Korb ist leer."
          description="Leg zuerst etwas hinein — danach geht die Kasse in zwei Minuten."
          actionLabel="Zum Menue"
          actionHref="/menue"
        />
      </div>
    );
  }

  const canContinue = () => {
    if (step === 0) return fulfillment === "pickup" || Boolean(findZone(address.postalCode ?? postalCode));
    if (step === 1) return !hasErrors(customerErrors) && !hasErrors(addressErrors);
    if (step === 2) return Boolean(payment);
    return true;
  };

  const next = () => {
    setTouched(true);
    if (!canContinue()) return;
    setTouched(false);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!payment || blocking.length > 0) return;
    setSubmitting(true);

    const id = orderNumber();
    const intent = await createPaymentIntent({
      amount: totals.total,
      currency: "EUR",
      orderId: id,
      method: payment,
    });

    if (intent.status === "unavailable") {
      setPaymentNote(intent.note);
      setSubmitting(false);
      return;
    }

    const order: Order = {
      id,
      createdAt: Date.now(),
      status: "received",
      fulfillment,
      scheduledFor: timing,
      items,
      totals: {
        subtotal: totals.subtotal,
        discount: totals.discount,
        deliveryFee: totals.deliveryFee,
        tip: totals.tip,
        total: totals.total,
      },
      customer: customer as Customer,
      address: fulfillment === "delivery" ? (address as Address) : undefined,
      payment,
      couponCode: totals.couponApplied?.code,
      etaMinutes: etaFor(fulfillment, findZone(address.postalCode ?? postalCode)),
    };

    addOrder(order);
    setCustomer(customer);
    if (fulfillment === "delivery" && address.street) saveAddress(address as Address);
    clear();
    toast({ title: "Bestellung aufgegeben", description: `Nummer ${id}`, tone: "success" });
    router.push(`/bestellungen/${id}?neu=1`);
  };

  return (
    <div className="shell pb-32 pt-28 lg:pb-24 lg:pt-36">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Kasse</p>
          <h1 className="display display-l mt-2">Letzter Schritt.</h1>
        </div>
        <Link href="/warenkorb" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-paper">
          <ArrowLeft className="size-4" aria-hidden />
          Zurueck zum Korb
        </Link>
      </header>

      <div className="mt-8 border-y border-line py-3">
        <StepIndicator steps={STEPS} current={step} onJump={setStep} />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)] lg:gap-14">
        <div className="min-h-[24rem]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              {step === 0 && (
                <section className="space-y-8" aria-labelledby="step-delivery">
                  <h2 id="step-delivery" className="display display-m">
                    Liefern oder holen?
                  </h2>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        { id: "delivery", label: "Lieferung", icon: Bike, note: "Wir bringen es zu dir." },
                        { id: "pickup", label: "Abholung", icon: Store, note: "In 15 Minuten fertig." },
                      ] as const
                    ).map(({ id, label, icon: Icon, note }) => {
                      const active = fulfillment === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setFulfillment(id)}
                          aria-pressed={active}
                          className={`card flex items-start gap-3 p-5 text-left transition ${
                            active ? "border-transparent bg-white/[0.06] ring-1 ring-ember" : "hover:border-line-strong"
                          }`}
                        >
                          <Icon className="mt-0.5 size-5 text-chrome" aria-hidden />
                          <span>
                            <span className="block text-base font-semibold">{label}</span>
                            <span className="mt-0.5 block text-[0.8125rem] text-muted">{note}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {fulfillment === "delivery" && (
                    <Field
                      label="Liefer-PLZ"
                      value={address.postalCode ?? ""}
                      onChange={(v) => {
                        const plz = v.replace(/\D/g, "").slice(0, 5);
                        setAddress((a) => ({ ...a, postalCode: plz }));
                        setPostalCode(plz);
                      }}
                      inputMode="numeric"
                      autoComplete="postal-code"
                      required
                      error={touched ? addressErrors.postalCode : undefined}
                      hint="Wir liefern in ausgewaehlte Hamburger Bezirke."
                      className="max-w-xs"
                    />
                  )}

                  <div>
                    <h3 className="kicker mb-3">Wann?</h3>
                    {!open.open && (
                      <p className="mb-3 rounded-xl border border-saffron/25 bg-saffron/8 p-3.5 text-[0.8125rem] text-saffron">
                        Gerade geschlossen{open.opensAt ? ` — wieder ab ${formatTime(open.opensAt)}.` : "."} Vorbestellen
                        geht trotzdem.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setTiming("asap")}
                        aria-pressed={timing === "asap"}
                        disabled={!open.open}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[0.8125rem] font-semibold transition disabled:opacity-40 ${
                          timing === "asap" ? "border-transparent bg-paper text-black" : "border-line text-chrome hover:text-paper"
                        }`}
                      >
                        <Zap className="size-4" aria-hidden />
                        So schnell wie moeglich
                      </button>
                      {slots.map((slot) => {
                        const iso = slot.toISOString();
                        const active = timing === iso;
                        return (
                          <button
                            key={iso}
                            type="button"
                            onClick={() => setTiming(iso)}
                            aria-pressed={active}
                            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[0.8125rem] font-semibold transition ${
                              active ? "border-transparent bg-paper text-black" : "border-line text-chrome hover:text-paper"
                            }`}
                          >
                            <Clock className="size-4" aria-hidden />
                            {formatTime(slot)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {step === 1 && (
                <section className="space-y-8" aria-labelledby="step-contact">
                  <h2 id="step-contact" className="display display-m">
                    Wer bekommt das Essen?
                  </h2>

                  {addresses.length > 0 && fulfillment === "delivery" && (
                    <div>
                      <h3 className="kicker mb-3">Gespeicherte Adressen</h3>
                      <div className="flex flex-wrap gap-2">
                        {addresses.map((a, i) => (
                          <button
                            key={`${a.street}-${i}`}
                            type="button"
                            onClick={() => setAddress(a)}
                            className="rounded-full border border-line px-4 py-2 text-[0.8125rem] text-chrome transition hover:border-line-strong hover:text-paper"
                          >
                            {a.street} {a.houseNumber}, {a.postalCode}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Vorname" required value={customer.firstName ?? ""} autoComplete="given-name"
                      onChange={(v) => setLocalCustomer((c) => ({ ...c, firstName: v }))}
                      error={touched ? customerErrors.firstName : undefined} />
                    <Field label="Nachname" required value={customer.lastName ?? ""} autoComplete="family-name"
                      onChange={(v) => setLocalCustomer((c) => ({ ...c, lastName: v }))}
                      error={touched ? customerErrors.lastName : undefined} />
                    <Field label="E-Mail" required type="email" inputMode="email" autoComplete="email"
                      value={customer.email ?? ""}
                      onChange={(v) => setLocalCustomer((c) => ({ ...c, email: v }))}
                      error={touched ? customerErrors.email : undefined} />
                    <Field label="Telefon" required type="tel" inputMode="tel" autoComplete="tel"
                      value={customer.phone ?? ""}
                      onChange={(v) => setLocalCustomer((c) => ({ ...c, phone: v }))}
                      error={touched ? customerErrors.phone : undefined}
                      hint="Nur fuer Rueckfragen des Fahrers." />
                  </div>

                  {fulfillment === "delivery" && (
                    <div className="grid gap-4 sm:grid-cols-6">
                      <Field className="sm:col-span-4" label="Strasse" required value={address.street ?? ""}
                        autoComplete="address-line1"
                        onChange={(v) => setAddress((a) => ({ ...a, street: v }))}
                        error={touched ? addressErrors.street : undefined} />
                      <Field className="sm:col-span-2" label="Hausnummer" required value={address.houseNumber ?? ""}
                        onChange={(v) => setAddress((a) => ({ ...a, houseNumber: v }))}
                        error={touched ? addressErrors.houseNumber : undefined} />
                      <Field className="sm:col-span-2" label="PLZ" required value={address.postalCode ?? ""}
                        inputMode="numeric" autoComplete="postal-code"
                        onChange={(v) => {
                          const plz = v.replace(/\D/g, "").slice(0, 5);
                          setAddress((a) => ({ ...a, postalCode: plz }));
                          setPostalCode(plz);
                        }}
                        error={touched ? addressErrors.postalCode : undefined} />
                      <Field className="sm:col-span-4" label="Ort" required value={address.city ?? ""}
                        autoComplete="address-level2"
                        onChange={(v) => setAddress((a) => ({ ...a, city: v }))}
                        error={touched ? addressErrors.city : undefined} />
                      <Field className="sm:col-span-3" label="Etage" value={address.floor ?? ""}
                        onChange={(v) => setAddress((a) => ({ ...a, floor: v }))} />
                      <Field className="sm:col-span-3" label="Klingelname" value={address.doorbell ?? ""}
                        onChange={(v) => setAddress((a) => ({ ...a, doorbell: v }))} />
                      <Field className="sm:col-span-6" label="Hinweis fuer den Fahrer" value={address.driverNote ?? ""}
                        maxLength={140}
                        onChange={(v) => setAddress((a) => ({ ...a, driverNote: v }))}
                        hint="Zum Beispiel: Hinterhof, zweite Klingel." />
                    </div>
                  )}
                </section>
              )}

              {step === 2 && (
                <section className="space-y-6" aria-labelledby="step-payment">
                  <h2 id="step-payment" className="display display-m">
                    Wie bezahlst du?
                  </h2>

                  <ul className="space-y-2">
                    {methods.map((method) => {
                      const active = payment === method.id;
                      return (
                        <li key={method.id}>
                          <button
                            type="button"
                            disabled={!method.enabled}
                            onClick={() => {
                              setPayment(method.id);
                              setPaymentNote(null);
                            }}
                            aria-pressed={active}
                            className={`card flex w-full items-center justify-between gap-4 p-4 text-left transition disabled:opacity-40 ${
                              active ? "border-transparent bg-white/[0.06] ring-1 ring-ember" : "hover:border-line-strong"
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <CreditCard className="size-[18px] text-chrome" aria-hidden />
                              <span>
                                <span className="block text-sm font-semibold">{method.label}</span>
                                {method.hint && <span className="mt-0.5 block text-xs text-muted">{method.hint}</span>}
                              </span>
                            </span>
                            {!method.enabled && (
                              <span className="rounded-full bg-white/5 px-2.5 py-1 text-[0.625rem] font-medium text-muted">
                                bald
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <p className="text-[0.8125rem] leading-relaxed text-muted">
                    Online-Zahlung ist im Testbetrieb bewusst deaktiviert. Es gibt keine
                    Schein-Zahlung: die Anbindung erfolgt spaeter ueber einen echten
                    Zahlungsdienstleister.
                  </p>
                  {paymentNote && (
                    <p className="rounded-xl border border-saffron/25 bg-saffron/8 p-3.5 text-[0.8125rem] text-saffron" role="status">
                      {paymentNote}
                    </p>
                  )}
                </section>
              )}

              {step === 3 && (
                <section className="space-y-8" aria-labelledby="step-review">
                  <h2 id="step-review" className="display display-m">
                    Alles richtig?
                  </h2>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="card p-5">
                      <h3 className="kicker mb-2">{fulfillment === "delivery" ? "Lieferadresse" : "Abholung"}</h3>
                      {fulfillment === "delivery" ? (
                        <address className="text-sm not-italic leading-relaxed text-chrome">
                          {customer.firstName} {customer.lastName}
                          <br />
                          {address.street} {address.houseNumber}
                          <br />
                          {address.postalCode} {address.city}
                          {address.floor && <><br />Etage: {address.floor}</>}
                          {address.doorbell && <><br />Klingel: {address.doorbell}</>}
                        </address>
                      ) : (
                        <p className="text-sm text-chrome">Abholung im Laden, {customer.firstName} {customer.lastName}</p>
                      )}
                    </div>
                    <div className="card p-5">
                      <h3 className="kicker mb-2">Zeit & Zahlung</h3>
                      <p className="text-sm text-chrome">
                        {timing === "asap" ? "So schnell wie moeglich" : `Zum ${formatTime(new Date(timing))} Uhr`}
                        <br />
                        {PAYMENT_METHODS.find((m) => m.id === payment)?.label}
                      </p>
                    </div>
                  </div>

                  <ul className="divide-y divide-[color:var(--color-line)] border-y border-line">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                        <span className="text-sm">
                          <span className="num text-muted">{item.quantity} ×</span> {item.name}
                        </span>
                        <span className="num text-sm">{formatPrice(item.unitPrice * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>

                  {blocking.length > 0 && (
                    <ul className="space-y-1.5" role="alert">
                      {blocking.map((issue) => (
                        <li key={issue.code} className="text-[0.8125rem] text-danger">
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-10 flex items-center gap-3">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="size-4" aria-hidden />
                Zurueck
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button onClick={next} size="lg" className="flex-1 sm:flex-none">
                Weiter
                <ArrowRight className="size-[18px]" aria-hidden />
              </Button>
            ) : (
              <Button
                onClick={submit}
                size="lg"
                disabled={submitting || blocking.length > 0 || !payment}
                className="flex-1 sm:flex-none"
                magnetic
              >
                {submitting ? "Wird gesendet …" : `Kostenpflichtig bestellen · ${formatPrice(totals.total)}`}
              </Button>
            )}
          </div>
          {touched && !canContinue() && (
            <p className="mt-3 text-[0.8125rem] text-saffron" role="status">
              Bitte die markierten Angaben ergaenzen.
            </p>
          )}
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="card p-5">
            <h2 className="kicker mb-4">Deine Bestellung</h2>
            <ul className="mb-4 space-y-2">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 text-[0.8125rem]">
                  <span className="text-chrome">
                    <span className="num text-muted">{item.quantity}×</span> {item.name}
                  </span>
                  <span className="num">{formatPrice(item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line pt-4">
              <CartTotals totals={totals} fulfillment={fulfillment} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
