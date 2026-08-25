import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

export function FinalCta() {
  return (
    <section className="shell border-t border-line py-24 lg:py-36">
      <div className="relative overflow-hidden rounded-[26px] border border-line bg-ink-2 px-8 py-16 lg:px-16 lg:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(60% 80% at 80% 20%, rgba(255,90,31,0.16), transparent 65%)" }}
        />
        <div className="relative">
          <h2 className="display display-l max-w-[14ch]">
            Your food.
            <br />
            Your rules.
          </h2>
          <p className="lede mt-6">Genug gelesen. Bau es dir.</p>
          <ButtonLink href="/bauen" size="lg" className="mt-10">
            Jetzt bauen
            <ArrowRight className="size-[18px]" aria-hidden />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
