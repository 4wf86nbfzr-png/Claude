"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "./nav";

export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="nav-group">{g.label}</div>
          {g.items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link key={it.href} href={it.href} className="nav-item no-underline" aria-current={active ? "page" : undefined}>
                {it.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}
