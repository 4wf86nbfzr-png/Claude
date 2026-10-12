import { AppShell } from "@/components/app-shell";

export const metadata = { title: "Dashboard", robots: { index: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
