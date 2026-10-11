import { requireCurrent } from "@/server/auth/current";
import { AppShell } from "@/components/layout/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const current = await requireCurrent();
  return <AppShell current={current}>{children}</AppShell>;
}
