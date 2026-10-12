import { AppShell } from "@/components/app-shell";

export const metadata = { title: "Betreiber", robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell admin>{children}</AppShell>;
}
