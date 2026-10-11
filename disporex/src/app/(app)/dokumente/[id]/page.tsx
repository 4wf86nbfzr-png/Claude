import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { getDocument, CATEGORY_LABELS } from "@/server/modules/documents/service";
import { PageHeader, Panel, Badge, Dl, LinkButton } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ui/form";
import { deleteDocumentAction, downloadLinkAction } from "../actions";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCurrent();
  const { document: d, versions } = await getDocument(ctx, id);
  const canWrite = ctx.permissions.has("documents:write");
  const entityLink = { employee: `/mitarbeiter/${d.entityId}`, customer: `/kunden/${d.entityId}`, partner: `/partner/${d.entityId}`, event: `/veranstaltungen/${d.entityId}` }[d.entityType as string];
  return (
    <>
      <PageHeader
        title={d.title}
        breadcrumb={<Link href="/dokumente">Dokumente</Link>}
        subtitle={
          <>
            <Badge tone={d.confidentiality === "confidential" ? "danger" : d.confidentiality === "shared" ? "accent" : "neutral"}>{d.confidentiality}</Badge> · {CATEGORY_LABELS[d.category] ?? d.category} · Version {d.version}
          </>
        }
        actions={
          <>
            {canWrite && <LinkButton href={`/dokumente?entityType=${d.entityType}&entityId=${d.entityId}&replaces=${d.id}`}>Neue Version hochladen</LinkButton>}
            {canWrite && <ActionButton action={deleteDocumentAction} label="Löschen" variant="danger" size={undefined} hidden={{ id: d.id }} confirm="Dokument löschen? Es wird nach 30 Tagen endgültig entfernt." />}
          </>
        }
      />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Panel title="Datei">
          <Dl
            items={[
              { k: "Dateiname", v: d.filename },
              { k: "Typ", v: d.mimeType },
              { k: "Größe", v: `${(d.sizeBytes / 1024).toFixed(1)} KB` },
              { k: "SHA-256", v: <span className="mono text-[11.5px] break-all">{d.sha256}</span> },
              { k: "Zuordnung", v: entityLink ? <Link href={entityLink}>{d.entityType}</Link> : d.entityType },
              { k: "Gültig bis", v: d.expiresAt ? fmtDate(d.expiresAt) : "–" },
              { k: "Hochgeladen", v: fmtDateTime(d.createdAt) },
            ]}
          />
          <ActionForm action={downloadLinkAction} submitLabel="Download-Link erzeugen" submitVariant="primary" className="mt-4">
            <input type="hidden" name="id" value={d.id} />
          </ActionForm>
        </Panel>
        <Panel title="Versionen" padded={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Version</th>
                <th>Datei</th>
                <th>Datum</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className={v.id === d.id ? "font-medium" : "text-ink-3"}>
                  <td className="num">{v.version}</td>
                  <td>{v.id === d.id ? v.filename : <Link href={`/dokumente/${v.id}`}>{v.filename}</Link>}</td>
                  <td>{fmtDateTime(v.createdAt)}</td>
                  <td>{v.deletedAt ? <Badge>ersetzt/gelöscht</Badge> : <Badge tone="ok">aktuell</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
