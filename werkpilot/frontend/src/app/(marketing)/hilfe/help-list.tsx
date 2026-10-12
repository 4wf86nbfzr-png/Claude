"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Article = { slug: string; title: string; category: string; body: string };

export function HelpList() {
  const [items, setItems] = useState<Article[] | null>(null);
  useEffect(() => { api<Article[]>("/api/support/articles").then(setItems).catch(() => setItems([])); }, []);
  if (items === null) return <p className="mt-8 text-sm text-muted">Lade Artikel …</p>;
  if (items.length === 0) return <p className="mt-8 text-sm text-muted">Das Hilfezentrum ist gerade nicht erreichbar.</p>;
  const cats = Array.from(new Set(items.map((a) => a.category)));
  return (
    <div className="mt-8 space-y-8">
      {cats.map((c) => (
        <section key={c}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{c}</h2>
          <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-paper">
            {items.filter((a) => a.category === c).map((a) => (
              <details key={a.slug} id={a.slug} className="group p-4">
                <summary className="cursor-pointer font-medium">{a.title}</summary>
                <p className="mt-2 text-sm text-ink-2">{a.body}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
