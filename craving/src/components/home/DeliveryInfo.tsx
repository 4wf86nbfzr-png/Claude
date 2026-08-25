import { Clock, MapPin, Wallet } from "lucide-react";
import { DELIVERY_ZONES } from "@/data/config";
import { formatPrice } from "@/lib/format";
import { openingSchedule } from "@/lib/opening";

/** Die harten Fakten: wo, wann, ab wie viel. Ohne Werbesprache. */
export function DeliveryInfo() {
  const schedule = openingSchedule();
  const minOrder = Math.min(...DELIVERY_ZONES.map((z) => z.minOrder));
  const fastest = Math.min(...DELIVERY_ZONES.map((z) => z.etaMinutes));

  return (
    <section aria-labelledby="fakten" className="shell border-t border-line py-20 lg:py-28">
      <div className="grid gap-10 lg:grid-cols-3 lg:gap-16">
        <div>
          <p className="kicker">Klartext</p>
          <h2 id="fakten" className="display display-m mt-3">
            Wo, wann, ab wie viel.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            Keine Sternchen. Mindestbestellwert und Lieferkosten haengen am
            Gebiet und stehen vor dem Bestellen fest.
          </p>
        </div>

        <dl className="grid gap-6 sm:grid-cols-3 lg:col-span-2">
          <div>
            <dt className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4 text-chrome" aria-hidden />
              Geoeffnet
            </dt>
            <dd className="mt-3 space-y-1 text-sm text-muted">
              {schedule.map((row) => (
                <p key={row.days} className="flex justify-between gap-3">
                  <span>{row.days}</span>
                  <span className="num">{row.hours}</span>
                </p>
              ))}
            </dd>
          </div>

          <div>
            <dt className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="size-4 text-chrome" aria-hidden />
              Liefergebiete
            </dt>
            <dd className="mt-3 space-y-2 text-sm text-muted">
              {DELIVERY_ZONES.map((z) => (
                <p key={z.id}>
                  <span className="block text-chrome">{z.label}</span>
                  <span className="num">
                    {z.postalCodes.slice(0, 4).join(", ")}
                    {z.postalCodes.length > 4 ? " …" : ""}
                  </span>
                </p>
              ))}
            </dd>
          </div>

          <div>
            <dt className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="size-4 text-chrome" aria-hidden />
              Konditionen
            </dt>
            <dd className="mt-3 space-y-2 text-sm text-muted">
              <p>
                Mindestbestellwert <span className="num text-chrome">ab {formatPrice(minOrder)}</span>
              </p>
              <p>
                Lieferzeit <span className="num text-chrome">ab {fastest} Min.</span>
              </p>
              <p>
                Abholung <span className="text-chrome">immer ohne Mindestwert</span>
              </p>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
