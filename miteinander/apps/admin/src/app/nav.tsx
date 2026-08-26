'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Übersicht' },
  { href: '/pruefungen', label: 'Nachweise' },
  { href: '/vorfaelle', label: 'Sicherheitsfälle' },
  { href: '/inhalte', label: 'Inhalte' },
  { href: '/protokoll', label: 'Protokoll' },
];

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Hauptnavigation">
      <ul>
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
