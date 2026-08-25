"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { getCategory, labelFor } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/stores/cart-store";
import type { CartItem } from "@/types/domain";

/**
 * Eine Warenkorbzeile. Zeigt ausdruecklich auch, was ABGEWAEHLT wurde —
 * "ohne Zwiebeln" ist fuer den Kunden genauso wichtig wie "mit Kaese"
 * und fuer die Kueche sowieso.
 */
export function CartLine({ item, flagged }: { item: CartItem; flagged?: boolean }) {
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const category = getCategory(item.categoryId);
  const editable = Boolean(category && !category.simple);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ duration: 0.25 }}
      className={`overflow-hidden border-b border-line py-5 ${flagged ? "bg-danger/5" : ""}`}
    >
      <div className="flex items-start gap-4">
        <span
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{ background: category?.accent ?? "var(--color-ember)" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-base font-bold tracking-tight">{item.name}</h3>
            <span className="num text-base font-semibold">{formatPrice(item.unitPrice * item.quantity)}</span>
          </div>

          {item.added.length > 0 && (
            <p className="mt-1.5 text-[0.8125rem] leading-snug text-chrome">
              <span className="text-muted">mit</span> {item.added.map(labelFor).join(", ")}
            </p>
          )}
          {item.removed.length > 0 && (
            <p className="mt-1 text-[0.8125rem] leading-snug text-chrome">
              <span className="text-muted">ohne</span> {item.removed.map(labelFor).join(", ")}
            </p>
          )}
          {item.note && <p className="mt-1 text-[0.8125rem] italic text-muted">„{item.note}“</p>}
          {flagged && (
            <p className="mt-2 text-[0.8125rem] font-medium text-danger">
              Etwas daran ist gerade nicht verfuegbar — bitte anpassen.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <QuantityStepper
              value={item.quantity}
              onChange={(q) => setQuantity(item.id, q)}
              min={0}
              size="sm"
              label={`Menge ${item.name}`}
            />
            <span className="num text-xs text-muted">Einzeln {formatPrice(item.unitPrice)}</span>
            <div className="ml-auto flex items-center gap-1">
              {editable && (
                <Link
                  href={`/bauen/${category?.slug}?bearbeiten=${item.id}`}
                  className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-white/5 hover:text-paper"
                  aria-label={`${item.name} bearbeiten`}
                >
                  <Pencil className="size-4" aria-hidden />
                </Link>
              )}
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-danger/10 hover:text-danger"
                aria-label={`${item.name} entfernen`}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.li>
  );
}
