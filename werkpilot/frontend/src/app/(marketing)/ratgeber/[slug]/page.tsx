import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Piece = { slug: string; title: string; meta_description: string | null; body_markdown: string; published_at: string | null };
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

async function load(slug: string): Promise<Piece | null> {
  try {
    const r = await fetch(`${BACKEND}/api/public/content/${encodeURIComponent(slug)}`, { next: { revalidate: 600 } });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: p.title, description: p.meta_description ?? undefined } : { title: "Artikel" };
}

/** Sehr kleiner Markdown-Renderer (Überschriften, Absätze, Listen) – kein HTML aus dem Markdown wird durchgereicht. */
function render(md: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join("")}</ul>`); list = []; } };
  for (const raw of lines) {
    const l = raw.trim();
    if (l.startsWith("# ")) { flush(); continue; }
    if (l.startsWith("## ")) { flush(); out.push(`<h2>${esc(l.slice(3))}</h2>`); continue; }
    if (l.startsWith("### ")) { flush(); out.push(`<h3>${esc(l.slice(4))}</h3>`); continue; }
    if (/^(-|\*|\d+\.)\s/.test(l)) { list.push(esc(l.replace(/^(-|\*|\d+\.)\s/, "").replace(/^\[ \]\s*/, "☐ "))); continue; }
    if (!l) { flush(); continue; }
    flush(); out.push(`<p>${esc(l)}</p>`);
  }
  flush();
  return out.join("\n");
}

export default async function Artikel({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  return (
    <article className="prose mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold md:text-4xl">{p.title}</h1>
      <div className="mt-6" dangerouslySetInnerHTML={{ __html: render(p.body_markdown) }} />
    </article>
  );
}
