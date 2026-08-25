"use client";

import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCartStore } from "@/stores/cart-store";
import { useUiStore } from "@/stores/ui-store";
import type { NewCartItem } from "@/stores/cart-store";

/**
 * Der "In den Warenkorb"-Moment: das Produkt fliegt sichtbar in den Korb,
 * der Zaehler springt, das Geraet vibriert kurz (wo unterstuetzt).
 */
export function CartButton({
  item,
  quantity,
  disabled,
  blockReason,
  previewRef,
  goToCart = false,
  label = "In den Warenkorb",
}: {
  item: NewCartItem;
  quantity: number;
  disabled?: boolean;
  blockReason?: string;
  previewRef: React.RefObject<HTMLDivElement | null>;
  goToCart?: boolean;
  label?: string;
}) {
  const add = useCartStore((s) => s.add);
  const launchFlight = useUiStore((s) => s.launchFlight);
  const toast = useUiStore((s) => s.toast);
  const router = useRouter();

  const onClick = () => {
    const node = previewRef.current;
    if (node) {
      const rect = node.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height) * 0.55;
      launchFlight({
        x: rect.left + rect.width / 2 - size / 2,
        y: rect.top + rect.height / 2 - size / 2,
        width: size,
        height: size,
        categoryId: item.categoryId,
      });
    }

    add({ ...item, quantity });
    navigator.vibrate?.(12);
    toast({
      title: `${quantity} × ${item.name} liegt im Korb`,
      description: "Weiter bauen oder zur Kasse.",
      tone: "success",
    });
    if (goToCart) router.push("/warenkorb");
  };

  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <Button size="lg" onClick={onClick} disabled={disabled} className="w-full" magnetic>
        <ShoppingBag className="size-[18px]" aria-hidden />
        {label}
      </Button>
      {disabled && blockReason && (
        <p className="text-center text-xs text-saffron" role="status">
          {blockReason}
        </p>
      )}
    </div>
  );
}
