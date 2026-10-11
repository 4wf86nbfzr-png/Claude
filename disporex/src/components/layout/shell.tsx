import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";
import { NAV } from "./nav";
import type { CurrentUser } from "@/server/auth/current";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { logoutAction } from "@/app/(auth)/actions";
import { NavLinks } from "./nav-links";
import { listUserTenants, getTenant } from "@/server/modules/tenants/service";
import { switchTenantAction } from "@/app/(app)/actions";
import { GlobalSearch } from "./search";
import { unreadNotificationCount } from "@/server/modules/notifications/service";

export async function AppShell({ current, children }: { current: CurrentUser; children: ReactNode }) {
  const { ctx, user } = current;
  const groups = NAV.map((g) => ({
    label: g.label,
    items: g.items.filter((it) => {
      if (it.permission) return ctx.permissions.has(it.permission);
      if (it.anyOf) return it.anyOf.some((p) => ctx.permissions.has(p));
      return true;
    }),
  })).filter((g) => g.items.length > 0);
  const tenantsOfUser = await listUserTenants(user.id);
  const tenant = ctx.tenantId ? await getTenant(ctx.tenantId) : null;
  const unread = ctx.tenantId && ctx.userId ? await unreadNotificationCount(ctx) : 0;

  return (
    <div className="min-h-full flex">
      <aside className="w-[232px] shrink-0 bg-navy-900 text-white flex flex-col no-print">
        <div className="px-4 h-14 flex items-center border-b border-white/10">
          <Link href="/dashboard" className="no-underline">
            <Logo light />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-2.5 pb-4" aria-label="Hauptnavigation">
          <NavLinks groups={groups} />
        </nav>
        <div className="px-4 py-3 border-t border-white/10 text-[12px] text-navy-100/70">
          <div className="text-white text-[13px] font-medium truncate">{user.name}</div>
          <div className="truncate">{ctx.role === "system" ? "Systemadministrator" : ROLE_LABELS[ctx.role]}</div>
          {tenant && <div className="truncate text-navy-100/50">{tenant.name}</div>}
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-panel border-b border-line flex items-center gap-3 px-5 no-print">
          <GlobalSearch enabled={ctx.permissions.has("search:use")} />
          <div className="ml-auto flex items-center gap-2">
            {tenantsOfUser.length > 1 && (
              <form action={switchTenantAction}>
                <select name="tenantId" className="input py-1 text-[13px]" defaultValue={ctx.tenantId} aria-label="Mandant wechseln" onChange={undefined}>
                  {tenantsOfUser.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button className="btn btn-ghost btn-sm ml-1" type="submit">
                  Wechseln
                </button>
              </form>
            )}
            <Link href="/benachrichtigungen" className="btn btn-ghost btn-sm relative" aria-label={`Benachrichtigungen, ${unread} ungelesen`}>
              <span aria-hidden="true">🔔</span>
              {unread > 0 && <span className="absolute -top-1 -right-1 bg-danger text-white rounded-full text-[10px] px-1.5 leading-4">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <Link href="/profil" className="btn btn-ghost btn-sm">
              Profil
            </Link>
            <form action={logoutAction}>
              <button className="btn btn-ghost btn-sm" type="submit">
                Abmelden
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-5 lg:p-6 max-w-[1500px] w-full">{children}</main>
      </div>
    </div>
  );
}
