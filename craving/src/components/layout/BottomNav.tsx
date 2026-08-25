"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, ShoppingBag, UtensilsCrossed, ReceiptText, User } from "lucide-react";
import { cartCount, useCartStore } from "@/stores/cart-store";
import { useHydrated } from "@/hooks/useHydrated";

const TABS = [
  { href: "/", label: "Start", icon: Home },
  { href: "/menue", label: "Menue", icon: UtensilsCrossed },
  { href: "/warenkorb", label: "Korb", icon: ShoppingBag },
  { href: "/bestellungen", label: "Orders", icon: ReceiptText },
  { href: "/konto", label: "Profil", icon: User },
];

/** Native App-Anmutung auf dem Telefon: feste Leiste, grosse Treffflaechen. */
export function BottomNav() {
  const pathname = usePathname();
  const items = useCartStore((s) => s.items);
  const hydrated = useHydrated();
  const count = hydrated ? cartCount(items) : 0;

  return (
    <nav
      aria-label="App-Navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isCart = href === "/warenkorb";
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[0.625rem] font-medium transition-colors ${
                  active ? "text-paper" : "text-muted"
                }`}
              >
                <span className="relative" data-cart-target={isCart ? "" : undefined}>
                  <Icon className="size-[22px]" aria-hidden />
                  {isCart && count > 0 && (
                    <motion.span
                      key={count}
                      initial={{ scale: 0.4 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 520, damping: 20 }}
                      className="num absolute -right-2.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-ember px-1 text-[0.625rem] font-bold text-white"
                    >
                      {count}
                    </motion.span>
                  )}
                </span>
                {label}
                {active && (
                  <motion.span
                    layoutId="tab-dot"
                    className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-ember"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
