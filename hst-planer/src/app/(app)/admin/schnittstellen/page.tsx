import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { WEBHOOK_EVENTS } from '@/lib/webhooks';
import { Hinweis, Karte, Leer, Seitenkopf } from '@/components/ui';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import {
  apiSchluesselAktion, apiSchluesselSperrenAktion, webhookAktion, webhookEntfernenAktion,
} from '../actions';

export const metadata: Metadata = { title: 'Schnittstellen' };
export const dynamic = 'force-dynamic';

/**
 * Schnittstellen (SecPlan 2, Bereich ADMINISTRATION).
 *
 * API-Schluessel und Webhooks. Ein Schluessel wird genau einmal
 * angezeigt und danach nur noch als Hash gehalten – wer ihn verliert,
 * bekommt einen neuen, nicht denselben zurueck.
 */
export default async function Schnittstellen() {
  await seite('admin.api');

  const [schluessel, webhooks, lieferungen] = await Promise.all([
    db.apiKey.findMany({ orderBy: { createdAt: 'desc' } }),
    db.webhook.findMany({ orderBy: { createdAt: 'desc' } }),
    db.webhookDelivery.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { webhook: { select: { name: true } } } }),
  ]);

  return (
    <>
      <Seitenkopf
        titel="Schnittstellen"
        brotkrumen={[{ href: '/admin', label: 'Administration' }]}
        unter="API-Schlüssel und Webhooks"
      />

      <div style={{ marginBottom: 14 }}>
        <Hinweis art="info">
          Ein API-Schlüssel wird nur beim Anlegen angezeigt. Danach steht in der Datenbank nur
          noch ein Hash – wer ihn verliert, bekommt einen neuen, nicht denselben zurück.
          Webhooks werden mit HMAC-SHA256 signiert; das Signaturgeheimnis gilt derselbe Satz.
        </Hinweis>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Karte titel="API-Schlüssel">
              {schluessel.length === 0 ? <Leer>Noch keine Schlüssel vergeben.</Leer> : (
                <table className="tabelle">
                  <thead><tr><th>Name</th><th>Präfix</th><th>Bereiche</th><th>Zuletzt genutzt</th><th>Status</th><th style={{ width: 1 }} /></tr></thead>
                  <tbody>
                    {schluessel.map((key) => (
                      <tr key={key.id} className={key.active ? undefined : 'zeile-grau'}>
                        <td>{key.name}</td>
                        <td className="zahl" style={{ fontSize: 12 }}>hst_{key.prefix}_…</td>
                        <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{key.scopes.join(', ') || 'alle'}</td>
                        <td className="zahl" style={{ fontSize: 12 }}>{key.lastUsedAt ? formatDateDE(key.lastUsedAt) : 'nie'}</td>
                        <td>{key.active ? <span className="marke marke-gruen">aktiv</span> : <span className="marke marke-grau">gesperrt</span>}</td>
                        <td>
                          {key.active && (
                            <AktionsFormular aktion={apiSchluesselSperrenAktion} meldungOben={false}>
                              <input type="hidden" name="id" value={key.id} />
                              <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Sperren</AktionsKnopf>
                            </AktionsFormular>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ padding: 14, borderTop: '1px solid var(--linie)' }}>
                <AktionsFormular aktion={apiSchluesselAktion} meldungOben={false} geheimnisLabel="API-Schlüssel"
                                 stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <input name="name" className="feld" placeholder="Bezeichnung, z. B. Website-Formular" required style={{ width: 'auto', flex: '1 1 220px' }} aria-label="Bezeichnung" />
                  {['requests', 'events', 'employees', 'jobs'].map((bereich) => (
                    <label key={bereich} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                      <input type="checkbox" name="scopes" value={bereich} /> {bereich}
                    </label>
                  ))}
                  <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Schlüssel erzeugen</AktionsKnopf>
                </AktionsFormular>
              </div>
            </Karte>

            <Karte titel="Webhooks">
              {webhooks.length === 0 ? <Leer>Keine Webhooks eingerichtet.</Leer> : (
                <table className="tabelle">
                  <thead><tr><th>Name</th><th>Ziel</th><th>Ereignisse</th><th style={{ width: 1 }} /></tr></thead>
                  <tbody>
                    {webhooks.map((hook) => (
                      <tr key={hook.id}>
                        <td>{hook.name}</td>
                        <td style={{ fontSize: 12, wordBreak: 'break-all' }}>{hook.url}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{hook.events.join(', ')}</td>
                        <td>
                          <AktionsFormular aktion={webhookEntfernenAktion} meldungOben={false}>
                            <input type="hidden" name="id" value={hook.id} />
                            <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Entfernen</AktionsKnopf>
                          </AktionsFormular>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ padding: 14, borderTop: '1px solid var(--linie)' }}>
                <Ausklapp titel="+ Webhook" knopfKlasse="knopf knopf-klein">
                  <AktionsFormular aktion={webhookAktion} meldungOben={false} geheimnisLabel="Signaturgeheimnis"
                                   stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', maxWidth: 780 }}>
                    <input name="name" className="feld" placeholder="Name" required style={{ width: 'auto', flex: '1 1 140px' }} aria-label="Name" />
                    <input name="url" type="url" className="feld" placeholder="https://…" required style={{ width: 'auto', flex: '1 1 260px' }} aria-label="Zieladresse" />
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 100%' }}>
                      {WEBHOOK_EVENTS.map((ereignis) => (
                        <label key={ereignis} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                          <input type="checkbox" name="events" value={ereignis} /> {ereignis}
                        </label>
                      ))}
                    </div>
                    <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Anlegen</AktionsKnopf>
                  </AktionsFormular>
                </Ausklapp>
              </div>
            </Karte>

            {lieferungen.length > 0 && (
              <Karte titel="Letzte Webhook-Zustellungen">
                <table className="tabelle">
                  <thead><tr><th>Zeitpunkt</th><th>Webhook</th><th>Ereignis</th><th>Ergebnis</th></tr></thead>
                  <tbody>
                    {lieferungen.map((lieferung) => (
                      <tr key={lieferung.id} className={lieferung.deliveredAt ? 'zeile-gruen' : 'zeile-rot'}>
                        <td className="zahl" style={{ fontSize: 12 }}>{formatDateDE(lieferung.createdAt)}</td>
                        <td>{lieferung.webhook.name}</td>
                        <td style={{ fontSize: 12 }}>{lieferung.event}</td>
                        <td style={{ fontSize: 12 }}>{lieferung.deliveredAt ? `HTTP ${lieferung.status}` : lieferung.error ?? 'offen'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Karte>
            )}
      </div>
    </>
  );
}
