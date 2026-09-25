import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { versandKonfiguriert } from '@/lib/email/versand';
import { postfachKonfiguriert } from '@/lib/email/mailbox';
import { kiVerfuegbar } from '@/lib/email/ai';
import { Hinweis, Karte, Leer, Paar, Raster, Seitenkopf } from '@/components/ui';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import { firmaSpeichernAktion, leistungsartAktion, qualifikationAktion, regelnSpeichernAktion, vorlageLoeschenAktion } from './actions';

export const metadata: Metadata = { title: 'Einstellungen' };
export const dynamic = 'force-dynamic';

interface Firma { name?: string; ort?: string; email?: string; telefon?: string; website?: string }
interface Abgleich { toleranzMinuten?: number; pausenToleranzMinuten?: number; autoZuordnungAb?: number }
interface Meldungen { dokumentVorlaufTage?: number; eventVorlaufStunden?: number; unterbesetzungAbTagen?: number }

export default async function Einstellungen() {
  const user = await seite('settings.view');
  const darfAendern = can(user.role, 'settings.edit');

  const [einstellungen, bereiche, qualifikationen, vorlagen] = await Promise.all([
    db.setting.findMany(),
    db.serviceType.findMany({ orderBy: { name: 'asc' } }),
    db.qualification.findMany({ orderBy: { name: 'asc' } }),
    db.importTemplate.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const werte = Object.fromEntries(einstellungen.map((e) => [e.key, e.value]));
  const firma = (werte.firma ?? {}) as Firma;
  const abgleich = (werte.abgleich ?? {}) as Abgleich;
  const meldungen = (werte.benachrichtigungen ?? {}) as Meldungen;

  return (
    <>
      <Seitenkopf titel="Einstellungen" unter="Stammdaten, Regeln und Vorlagen" />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="dashboard-raster">
        <Karte titel="Firma">
          <div style={{ padding: 16 }}>
            <AktionsFormular aktion={firmaSpeichernAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Raster min={180}>
                <label className="feld-gruppe"><span className="feld-label">Name</span>
                  <input name="name" className="feld" defaultValue={firma.name ?? ''} disabled={!darfAendern} /></label>
                <label className="feld-gruppe"><span className="feld-label">Ort</span>
                  <input name="ort" className="feld" defaultValue={firma.ort ?? ''} disabled={!darfAendern} /></label>
                <label className="feld-gruppe"><span className="feld-label">E-Mail</span>
                  <input name="email" type="email" className="feld" defaultValue={firma.email ?? ''} disabled={!darfAendern} /></label>
                <label className="feld-gruppe"><span className="feld-label">Telefon</span>
                  <input name="telefon" className="feld" defaultValue={firma.telefon ?? ''} disabled={!darfAendern} /></label>
                <label className="feld-gruppe"><span className="feld-label">Website</span>
                  <input name="website" className="feld" defaultValue={firma.website ?? ''} disabled={!darfAendern} /></label>
              </Raster>
              {darfAendern && <div><AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Speichern</AktionsKnopf></div>}
            </AktionsFormular>
          </div>
        </Karte>

        <Karte titel="Regeln">
          <div style={{ padding: 16 }}>
            <AktionsFormular aktion={regelnSpeichernAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Raster min={160}>
                <label className="feld-gruppe"><span className="feld-label">Zeittoleranz Abgleich (Min)</span>
                  <input name="toleranz" type="number" min={0} max={240} className="feld zahl" defaultValue={abgleich.toleranzMinuten ?? 15} disabled={!darfAendern} /></label>
                <label className="feld-gruppe"><span className="feld-label">Pausentoleranz (Min)</span>
                  <input name="pausenToleranz" type="number" min={0} max={240} className="feld zahl" defaultValue={abgleich.pausenToleranzMinuten ?? 15} disabled={!darfAendern} /></label>
                <label className="feld-gruppe"><span className="feld-label">Automatische Zuordnung ab</span>
                  <input name="autoZuordnung" type="number" step="0.01" min={0.5} max={1} className="feld zahl" defaultValue={abgleich.autoZuordnungAb ?? 0.92} disabled={!darfAendern} />
                  <span className="feld-hinweis">Treffergüte von 0 bis 1.</span></label>
                <label className="feld-gruppe"><span className="feld-label">Warnung Nachweise (Tage)</span>
                  <input name="dokumentVorlauf" type="number" min={1} max={180} className="feld zahl" defaultValue={meldungen.dokumentVorlaufTage ?? 30} disabled={!darfAendern} /></label>
                <label className="feld-gruppe"><span className="feld-label">Erinnerung vor Event (Std)</span>
                  <input name="eventVorlauf" type="number" min={1} max={168} className="feld zahl" defaultValue={meldungen.eventVorlaufStunden ?? 24} disabled={!darfAendern} /></label>
                <label className="feld-gruppe"><span className="feld-label">Unterbesetzung melden ab (Tage)</span>
                  <input name="unterbesetzung" type="number" min={1} max={60} className="feld zahl" defaultValue={meldungen.unterbesetzungAbTagen ?? 3} disabled={!darfAendern} /></label>
              </Raster>
              {darfAendern && <div><AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Speichern</AktionsKnopf></div>}
            </AktionsFormular>
          </div>
        </Karte>

        <Karte titel="Leistungsarten">
          <table className="tabelle">
            <thead><tr><th>Kürzel</th><th>Bezeichnung</th><th>Farbe</th></tr></thead>
            <tbody>
              {bereiche.map((bereich) => (
                <tr key={bereich.id}>
                  <td className="zahl" style={{ fontSize: 12 }}>{bereich.code}</td>
                  <td>{bereich.name}</td>
                  <td><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: bereich.color, verticalAlign: 'middle' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {darfAendern && (
            <div style={{ padding: 14, borderTop: '1px solid var(--linie)' }}>
              <Ausklapp titel="+ Leistungsart" knopfKlasse="knopf knopf-klein">
                <AktionsFormular aktion={leistungsartAktion} stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <input name="code" className="feld" placeholder="KUERZEL" required style={{ width: 'auto' }} aria-label="Kürzel" />
                  <input name="name" className="feld" placeholder="Bezeichnung" required style={{ width: 'auto', flex: '1 1 160px' }} aria-label="Bezeichnung" />
                  <input name="color" type="color" className="feld" defaultValue="#3B82F6" style={{ width: 52, padding: 3 }} aria-label="Farbe" />
                  <AktionsKnopf klasse="knopf knopf-klein knopf-primaer">Speichern</AktionsKnopf>
                </AktionsFormular>
              </Ausklapp>
            </div>
          )}
        </Karte>

        <Karte titel="Qualifikationen">
          <table className="tabelle">
            <thead><tr><th>Kürzel</th><th>Bezeichnung</th><th>Ablaufend</th></tr></thead>
            <tbody>
              {qualifikationen.map((q) => (
                <tr key={q.id}>
                  <td className="zahl" style={{ fontSize: 12 }}>{q.code}</td>
                  <td>{q.name}</td>
                  <td>{q.expires ? <span className="marke marke-gelb">ja</span> : <span className="marke marke-grau">nein</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {darfAendern && (
            <div style={{ padding: 14, borderTop: '1px solid var(--linie)' }}>
              <Ausklapp titel="+ Qualifikation" knopfKlasse="knopf knopf-klein">
                <AktionsFormular aktion={qualifikationAktion} stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <input name="code" className="feld" placeholder="KUERZEL" required style={{ width: 'auto' }} aria-label="Kürzel" />
                  <input name="name" className="feld" placeholder="Bezeichnung" required style={{ width: 'auto', flex: '1 1 160px' }} aria-label="Bezeichnung" />
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                    <input type="checkbox" name="expires" /> läuft ab
                  </label>
                  <AktionsKnopf klasse="knopf knopf-klein knopf-primaer">Speichern</AktionsKnopf>
                </AktionsFormular>
              </Ausklapp>
            </div>
          )}
        </Karte>

        <Karte titel="Importvorlagen">
          {vorlagen.length === 0 ? <Leer>Noch keine Vorlage gespeichert. Vorlagen entstehen beim Abgleich.</Leer> : (
            <table className="tabelle">
              <thead><tr><th>Name</th><th>Zuordnung</th>{darfAendern && <th style={{ width: 1 }} />}</tr></thead>
              <tbody>
                {vorlagen.map((vorlage) => (
                  <tr key={vorlage.id}>
                    <td>{vorlage.name}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {Object.entries(vorlage.mapping as Record<string, string>).map(([feld, spalte]) => `${feld}: ${spalte}`).join(' · ')}
                    </td>
                    {darfAendern && (
                      <td>
                        <AktionsFormular aktion={vorlageLoeschenAktion} meldungOben={false}>
                          <input type="hidden" name="id" value={vorlage.id} />
                          <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Entfernen</AktionsKnopf>
                        </AktionsFormular>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Karte>

        <Karte titel="Schnittstellen">
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Paar label="Postfach (IMAP)">
              {postfachKonfiguriert()
                ? <span className="marke marke-gruen">eingerichtet · {process.env.EMAIL_USER}</span>
                : <span className="marke marke-gelb">nicht eingerichtet</span>}
            </Paar>
            <Paar label="Versand (SMTP)">
              {versandKonfiguriert() ? <span className="marke marke-gruen">eingerichtet</span> : <span className="marke marke-gelb">nicht eingerichtet</span>}
            </Paar>
            <Paar label="KI-Unterstützung">
              {kiVerfuegbar() ? <span className="marke marke-gruen">aktiv</span> : <span className="marke marke-grau">nicht aktiv – Parser arbeitet regelbasiert</span>}
            </Paar>
            <Hinweis art="info">
              Zugangsdaten werden ausschließlich über die Datei <code>.env</code> gesetzt und sind
              bewusst nicht über die Oberfläche änderbar. Die Vorlage steht in <code>.env.example</code>.
            </Hinweis>
          </div>
        </Karte>
      </div>
    </>
  );
}
