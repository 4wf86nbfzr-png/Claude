"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { BRAND } from "@/data/config";
import { cartCount, useCartStore } from "@/stores/cart-store";
import { useHydrated } from "@/hooks/useHydrated";
import { OpenBadge } from "@/components/layout/OpenBadge";

const LINKS = [
  { href: "/menue", label: "Menue" },
  { href: "/bauen", label: "Builder" },
  { href: "/bestellungen", label: "Bestellungen" },
  { href: "/konto", label: "Konto" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const items = useCartStore((s) => s.items);
  const hydrated = useHydrated();
  const count = hydrated ? cartCount(items) : 0;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-line bg-ink/80 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <div className="shell flex h-16 items-center justify-between gap-6 lg:h-20">
        <Link href="/" className="group flex items-baseline gap-2" aria-label={`${BRAND.name} — Startseite`}>
          <span className="display text-2xl tracking-[-0.01em] lg:text-3xl">{BRAND.wordmark}</span>
          <span className="hidden h-1.5 w-1.5 rounded-full bg-ember transition-transform group-hover:scale-150 sm:block" aria-hidden />
        </Link>

        <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active ? "text-paper" : "text-muted hover:text-paper"
                }`}
              >
                {link.label}
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-10 rounded-full border border-line bg-white/5"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <OpenBadge className="hidden sm:flex" />
          <Link
            href="/warenkorb"
            data-cart-target
            className="relative grid size-11 place-items-center rounded-full border border-line bg-ink-2 transition hover:border-line-strong hover:bg-ink-3"
            aria-label={count > 0 ? `Warenkorb, ${count} Artikel` : "Warenkorb, leer"}
          >
            <ShoppingBag className="size-[18px]" aria-hidden />
            {count > 0 && (
              <motion.span
                key={count}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 520, damping: 20 }}
                className="num absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-ember px-1.5 py-0.5 text-[0.6875rem] font-bold text-white"
              >
                {count}
              </motion.span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
