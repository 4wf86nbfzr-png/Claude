import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";

const TABS = [
  { href: "/einstellungen", label: "Unternehmen", perm: "settings:read" },
  { href: "/einstellungen/benutzer", label: "Benutzer", perm: "users:read" },
  { href: "/einstellungen/rollen", label: "Rollen & Rechte", perm: "settings:read" },
  { href: "/einstellungen/api-schluessel", label: "API-Schlüssel", perm: "api_keys:manage" },
  { href: "/einstellungen/webhooks", label: "Webhooks", perm: "webhooks:manage" },
  { href: "/einstellungen/automatisierungen", label: "Automatisierungen", perm: "automations:manage" },
  { href: "/einstellungen/zustellung", label: "Zustellung", perm: "notifications:admin" },
  { href: "/einstellungen/system", label: "System", perm: "settings:read" },
] as const;

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { ctx } = await requireCurrent();
  const tabs = TABS.filter((t) => ctx.permissions.has(t.perm));
  return (
    <div>
      <nav className="flex flex-wrap gap-1 border-b border-line mb-5" aria-label="Einstellungen">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="px-3 py-2 text-[13px] text-ink-2 hover:text-ink border-b-2 border-transparent hover:border-line-strong -mb-px no-underline">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
