import type { Metadata } from "next";
import { AccountScreen } from "@/features/account/AccountScreen";

export const metadata: Metadata = {
  title: "Konto",
  description: "Profil, Adressen, Favoriten und Bestellungen — ohne Anmeldezwang.",
};

export default function AccountPage() {
  return <AccountScreen />;
}
