import type { Metadata } from "next";
import { DraftNotice, PH } from "@/components/legal";

export const metadata: Metadata = { title: "Widerrufsbelehrung", robots: { index: false } };

export default function Widerruf() {
  return (
    <div className="prose mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Widerrufsbelehrung</h1>
      <DraftNotice items={["Prüfen, ob Clairify ausschließlich an Unternehmer anbietet (dann kein gesetzliches Widerrufsrecht; Hinweis beibehalten oder Seite entfernen)", "Falls Verbraucher nicht ausgeschlossen werden können: vollständige Belehrung mit Muster-Widerrufsformular einfügen"]} />
      <p>Clairify richtet sich ausschließlich an Unternehmer (§ 14 BGB), insbesondere Handwerksbetriebe. Ein gesetzliches Widerrufsrecht für Verbraucher nach § 312g BGB besteht daher nicht.</p>
      <p>Unabhängig davon können Sie die kostenlose Testphase jederzeit beenden und kostenpflichtige Abonnements monatlich zum Laufzeitende im Kundenportal kündigen.</p>
      <p>{PH("Falls Verbraucher Vertragspartner werden können: Belehrung ergänzen")}</p>
    </div>
  );
}
