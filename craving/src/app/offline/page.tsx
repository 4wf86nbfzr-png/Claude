import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Offline", robots: { index: false, follow: false } };

export default function OfflinePage() {
  return (
    <div className="pt-24 lg:pt-32">
      <EmptyState
        icon={WifiOff}
        kicker="Keine Verbindung"
        title="Gerade offline."
        description="Dein Warenkorb ist gespeichert und wartet. Sobald das Netz wieder da ist, geht es genau hier weiter."
        actionLabel="Nochmal versuchen"
        actionHref="/"
      />
    </div>
  );
}
