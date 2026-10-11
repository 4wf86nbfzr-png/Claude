"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GlobalSearch({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  if (!enabled) return <div />;
  return (
    <form
      role="search"
      className="w-full max-w-[420px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/suche?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <input className="input py-1.5 text-[13px]" type="search" placeholder="Suchen: Mitarbeiter, Kunden, Veranstaltungen …  (Enter)" aria-label="Globale Suche" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}
