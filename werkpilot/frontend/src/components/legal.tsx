import { Alert } from "@/components/ui";

export function DraftNotice({ items }: { items: string[] }) {
  return (
    <div className="mb-8 space-y-3">
      <Alert tone="warn"><strong>Entwurf – nicht anwaltlich geprüft.</strong> Dieser Text ist eine Arbeitsgrundlage und muss vor dem Produktivstart von einer Rechtsanwältin oder einem Rechtsanwalt geprüft und die Platzhalter müssen ersetzt werden.</Alert>
      <details className="rounded-xl border border-line bg-paper p-4 text-sm"><summary className="cursor-pointer font-medium">Noch zu ergänzen / zu prüfen ({items.length})</summary><ul className="mt-2 list-disc pl-5 text-ink-2">{items.map((i) => <li key={i}>{i}</li>)}</ul></details>
    </div>
  );
}

export const PH = (t: string) => <span className="rounded bg-warn-soft px-1 text-warn">[{t}]</span>;
