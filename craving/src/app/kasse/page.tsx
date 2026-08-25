import type { Metadata } from "next";
import { CheckoutScreen } from "@/features/checkout/CheckoutScreen";

export const metadata: Metadata = {
  title: "Kasse",
  description: "Lieferart, Adresse, Zeit und Zahlung — in vier Schritten bestellt.",
};

export default function CheckoutPage() {
  return <CheckoutScreen />;
}
