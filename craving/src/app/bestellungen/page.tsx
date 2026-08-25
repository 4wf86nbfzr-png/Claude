import type { Metadata } from "next";
import { OrdersScreen } from "@/features/tracking/OrdersScreen";

export const metadata: Metadata = {
  title: "Bestellungen",
  description: "Status deiner Bestellungen und Express-Reorder.",
};

export default function OrdersPage() {
  return <OrdersScreen />;
}
