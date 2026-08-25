import type { Metadata } from "next";
import { CartScreen } from "@/features/cart/CartScreen";

export const metadata: Metadata = {
  title: "Warenkorb",
  description: "Deine Auswahl, Lieferart, Trinkgeld und Gutschein — alles auf einen Blick.",
};

export default function CartPage() {
  return <CartScreen />;
}
