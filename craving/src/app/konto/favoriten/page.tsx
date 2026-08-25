import type { Metadata } from "next";
import { FavoritesScreen } from "@/features/account/FavoritesScreen";

export const metadata: Metadata = {
  title: "Favoriten",
  description: "Gespeicherte Konfigurationen — mit einem Tippen wieder bestellt.",
};

export default function FavoritesPage() {
  return <FavoritesScreen />;
}
