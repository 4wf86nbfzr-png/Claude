"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/site";
import { useAuth } from "@/lib/auth";

const items = [
  ["/app", "Übersicht"], ["/app/anfragen", "Anfragen"], ["/app/entwuerfe", "Entwürfe"], ["/app/kunden", "Kunden"], ["/app/termine", "Termine"],
  ["/app/angebote", "Angebote"], ["/app/berichte", "Berichte"], ["/app/integrationen", "Integrationen"], ["/app/abonnement", "Abonnement"],
  ["/app/nutzer", "Nutzer"], ["/app/support", "Support"], ["/app/einstellungen", "Einstellungen"],
];

export function AppShell({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { loading, user, tenants, tenantId, logout, switchTenant } = useAuth();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!loading && !user) router.replace("/anmelden");
    if (!loading && user && admin && !user.is_operator) router.replace("/app");
  }, [loading, user, admin, router]);
  if (loading || !user) return <div className="p-10 text-sm text-muted">Lade …</div>;
  const nav = admin
    ? [["/admin", "Betrieb"], ["/admin/freigaben", "Freigaben"], ["/admin/agenten", "Agenten"], ["/admin/aufgaben", "Aufgaben"], ["/admin/finanzen", "Finanzen"], ["/admin/tarife", "Tarife"], ["/admin/leads", "Interessenten"], ["/admin/inhalte", "Inhalte"], ["/admin/fehler", "Fehler & Jobs"], ["/admin/support", "Support"]]
    : items;
  return (
    <div className="flex min-h-screen">
      <a href="#inhalt" className="skip-link">Zum Inhalt springen</a>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-paper p-4 md:flex">
        <Logo />
        {!admin && tenants.length > 0 && (
          <select aria-label="Betrieb wechseln" className="mt-4 w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-sm" value={tenantId ?? ""} onChange={(e) => switchTenant(e.target.value).then(() => router.refresh())}>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <nav aria-label="Dashboard" className="mt-6 flex flex-col gap-0.5 text-sm">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={`rounded-lg px-3 py-2 ${path === href || (href !== "/app" && href !== "/admin" && path.startsWith(href)) ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-sand-2"}`}>{label}</Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 pt-6 text-xs text-muted">
          <div className="truncate">{user.email}</div>
          {user.is_operator && <Link href={admin ? "/app" : "/admin"} className="block text-accent">{admin ? "→ Kundenansicht" : "→ Betreiberansicht"}</Link>}
          <button onClick={() => logout().then(() => router.push("/"))} className="text-ink-2 underline">Abmelden</button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-paper px-4 py-3 md:hidden">
          <Logo />
          <button onClick={() => logout().then(() => router.push("/"))} className="text-sm text-ink-2">Abmelden</button>
        </header>
        <nav aria-label="Dashboard mobil" className="flex gap-3 overflow-x-auto border-b border-line bg-paper px-4 py-2 text-sm md:hidden">
          {nav.map(([href, label]) => <Link key={href} href={href} className={`whitespace-nowrap ${path === href ? "font-medium text-accent" : "text-ink-2"}`}>{label}</Link>)}
        </nav>
        <main id="inhalt" className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
