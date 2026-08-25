"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Pencil, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { FoodRender } from "@/features/builder/renderers";
import { useHydrated } from "@/hooks/useHydrated";
import { diffSelections, getCategory, getProduct, optionEffects, selectedIngredients } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { priceBuild } from "@/lib/pricing";
import { useAccountStore } from "@/stores/account-store";
import { useCartStore } from "@/stores/cart-store";
import { useUiStore } from "@/stores/ui-store";
import type { SavedBuild } from "@/types/domain";

function FavoriteCard({ favorite }: { favorite: SavedBuild }) {
  const category = getCategory(favorite.categoryId);
  const product = getProduct(favorite.productId);
  const removeFavorite = useAccountStore((s) => s.removeFavorite);
  const renameFavorite = useAccountStore((s) => s.renameFavorite);
  const add = useCartStore((s) => s.add);
  const toast = useUiStore((s) => s.toast);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(favorite.label);

  const data = useMemo(() => {
    if (!category || !product) return null;
    return {
      ingredients: selectedIngredients(category, favorite.selections),
      effects: optionEffects(category, favorite.selections),
      price: priceBuild(category, product, favorite.selections),
      diff: diffSelections(product, favorite.selections),
    };
  }, [category, product, favorite.selections]);

  if (!category || !product || !data) return null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="card overflow-hidden"
    >
      <div className="relative aspect-[5/3] w-full overflow-hidden border-b border-line bg-ink">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: `radial-gradient(55% 60% at 50% 45%, ${category.accent}1A, transparent 70%)` }}
        />
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <FoodRender
            categoryId={category.id}
            ingredients={data.ingredients}
            effects={data.effects}
            label={favorite.label}
          />
        </div>
      </div>

      <div className="p-5">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              renameFavorite(favorite.id, label.trim() || favorite.label);
              setEditing(false);
            }}
            className="flex gap-2"
          >
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 40))}
              aria-label="Name des Favoriten"
              className="flex-1 rounded-lg border border-line bg-ink p-2.5 text-sm focus:border-line-strong focus:outline-none"
            />
            <button type="submit" className="rounded-lg border border-line px-3 text-sm font-semibold">
              OK
            </button>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold">{favorite.label}</h3>
              <p className="mt-0.5 text-xs text-muted">
                {category.name} · {product.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-white/5 hover:text-paper"
              aria-label="Umbenennen"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          </div>
        )}

        <p className="mt-3 line-clamp-2 text-[0.8125rem] text-chrome">
          {data.ingredients.map((i) => i.name).join(", ") || "Nur die Basis"}
        </p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="num text-base font-semibold">{formatPrice(data.price.unit)}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => removeFavorite(favorite.id)}
              className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-danger/10 hover:text-danger"
              aria-label={`${favorite.label} entfernen`}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
            <Link
              href={`/bauen/${category.slug}?favorit=${favorite.id}`}
              className="inline-flex h-9 items-center rounded-full border border-line px-4 text-[0.8125rem] font-semibold transition hover:border-line-strong"
            >
              Anpassen
            </Link>
            <Button
              size="sm"
              onClick={() => {
                add({
                  productId: product.id,
                  categoryId: category.id,
                  name: favorite.label,
                  unitPrice: data.price.unit,
                  selections: favorite.selections,
                  added: data.diff.added,
                  removed: data.diff.removed,
                });
                navigator.vibrate?.(10);
                toast({ title: `${favorite.label} liegt im Korb`, tone: "success" });
              }}
            >
              <ShoppingBag className="size-4" aria-hidden />
              Bestellen
            </Button>
          </div>
        </div>
      </div>
    </motion.li>
  );
}

export function FavoritesScreen() {
  const hydrated = useHydrated();
  const favorites = useAccountStore((s) => s.favorites);

  if (!hydrated) {
    return (
      <div className="shell grid gap-4 pb-24 pt-28 sm:grid-cols-2 xl:grid-cols-3 lg:pt-36">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="pt-24 lg:pt-32">
        <EmptyState
          icon={Heart}
          kicker="Noch nichts gemerkt"
          title="Dein Stammgericht fehlt."
          description="Bau einmal genau so, wie du es magst, und tippe im Builder auf „Merken“. Danach liegt es hier — mit einem Tippen bestellt."
          actionLabel="Jetzt bauen"
          actionHref="/bauen"
        />
      </div>
    );
  }

  return (
    <div className="shell pb-24 pt-28 lg:pt-36">
      <header>
        <p className="kicker">Gemerkt</p>
        <h1 className="display display-l mt-2">Deine Favoriten.</h1>
        <p className="lede mt-4">Einmal gebaut, jederzeit wieder da.</p>
      </header>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {favorites.map((f) => (
            <FavoriteCard key={f.id} favorite={f} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
