import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listMyNotifications } from "@/server/modules/notifications/service";
import { PageHeader, Panel, EmptyState, Badge } from "@/components/ui";
import { ActionButton } from "@/components/ui/form";
import { markReadAction } from "./actions";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Benachrichtigungen" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { ctx } = await requireCurrent();
  const items = await listMyNotifications(ctx);
  const tone = (p: string) => (p === "critical" ? "danger" : p === "high" ? "warn" : "neutral");
  return (
    <>
      <PageHeader title="Benachrichtigungen" actions={items.some((n) => !n.readAt) ? <ActionButton action={markReadAction} label="Alle als gelesen markieren" hidden={{ id: "all" }} /> : undefined} />
      <Panel padded={false}>
        {items.length === 0 ? (
          <EmptyState title="Keine Benachrichtigungen" />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.readAt ? "" : "bg-accent-soft/40"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13.5px] ${n.readAt ? "" : "font-medium"}`}>{n.title}</span>
                    {n.priority !== "normal" && <Badge tone={tone(n.priority)}>{n.priority}</Badge>}
                  </div>
                  <p className="text-[13px] text-ink-2 whitespace-pre-line">{n.body}</p>
                  <div className="text-[12px] text-ink-4 mt-1">
                    {fmtDateTime(n.createdAt)}
                    {n.link && (
                      <>
                        {" · "}
                        <Link href={n.link}>Öffnen</Link>
                      </>
                    )}
                  </div>
                </div>
                {!n.readAt && <ActionButton action={markReadAction} label="Gelesen" variant="ghost" hidden={{ id: n.id }} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
