import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ratgeber", description: "Praktische Anleitungen für Handwerksbetriebe: Anfragen, Angebote, Termine, Büroorganisation." };

type Piece = { slug: string; title: string; meta_description: string | null; published_at: string | null };

async function load(): Promise<Piece[]> {
  try {
    const r = await fetch(`${process.env.BACKEND_URL ?? "http://localhost:8000"}/api/public/content`, { next: { revalidate: 600 } });
    if (!r.ok) return [];
    return r.json();
  } catch { return []; }
}

export default async function Ratgeber() {
  const items = await load();
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold md:text-4xl">Ratgeber</h1>
      <p className="mt-3 text-ink-2">Anleitungen aus der Praxis, ohne Werbeversprechen. Jeder Artikel wird vor Veröffentlichung geprüft.</p>
      {items.length === 0 ? <p className="mt-8 text-sm text-muted">Noch keine Artikel veröffentlicht.</p> : (
        <ul className="mt-8 divide-y divide-line">{items.map((p) => <li key={p.slug} className="py-4"><a href={`/ratgeber/${p.slug}`} className="text-lg font-medium text-accent">{p.title}</a><p className="mt-1 text-sm text-ink-2">{p.meta_description}</p></li>)}</ul>
      )}
    </div>
  );
}
