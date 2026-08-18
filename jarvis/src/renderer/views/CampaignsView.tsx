import { useCallback, useEffect, useState } from 'react';
import type { CampaignRecord, JarvisError } from '../../shared/types.js';

interface Props {
  dataVersion: number;
  onError(error: JarvisError): void;
  onAsk(prompt: string): void;
}

export function CampaignsView({ dataVersion, onError, onAsk }: Props): JSX.Element {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [name, setName] = useState('');
  const [service, setService] = useState('');
  const [region, setRegion] = useState('');
  const [targetCount, setTargetCount] = useState(25);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setCampaigns(await window.jarvis.campaigns.list());
  }, []);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const create = async (): Promise<void> => {
    if (!name.trim() || !service.trim()) return;
    setBusy(true);
    try {
      const result = await window.jarvis.campaigns.create({
        name: name.trim(),
        service: service.trim(),
        region: region.trim() || null,
        targetCount,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setName('');
      setService('');
      setRegion('');
      setNotes('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view">
      <h1>Kampagnen</h1>

      <p>
        Eine Kampagne bündelt Zielgruppe, angebotene Leistung und Region. JARVIS recherchiert dazu
        Unternehmen und bereitet individuelle Entwürfe vor. Der Versand bleibt in jedem Fall freigabepflichtig.
      </p>

      <div className="editor">
        <div className="grid-2">
          <div className="field">
            <span className="field__label">Name</span>
            <input
              className="input"
              value={name}
              placeholder="Hamburger Bauunternehmen"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <span className="field__label">Dienstleistung</span>
            <input
              className="input"
              value={service}
              placeholder="24/7 Baustellenbewachung und Alarmüberwachung"
              onChange={(event) => setService(event.target.value)}
            />
          </div>
          <div className="field">
            <span className="field__label">Region</span>
            <input
              className="input"
              value={region}
              placeholder="Hamburg + 50 km"
              onChange={(event) => setRegion(event.target.value)}
            />
          </div>
          <div className="field">
            <span className="field__label">Zielanzahl</span>
            <input
              className="input"
              type="number"
              min={1}
              max={500}
              value={targetCount}
              onChange={(event) => setTargetCount(Number.parseInt(event.target.value, 10) || 25)}
            />
          </div>
        </div>
        <div className="field">
          <span className="field__label">Hinweise für die Anschreiben</span>
          <textarea
            className="textarea"
            style={{ minHeight: 80 }}
            value={notes}
            placeholder="Worauf soll JARVIS in den Mails eingehen?"
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn--primary btn--small"
          onClick={() => void create()}
          disabled={busy || !name.trim() || !service.trim()}
        >
          Kampagne anlegen
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Kampagne</th>
            <th>Dienstleistung</th>
            <th>Region</th>
            <th>Ziel</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {campaigns.length === 0 ? (
            <tr>
              <td className="table__empty" colSpan={6}>
                Noch keine Kampagne angelegt.
              </td>
            </tr>
          ) : null}
          {campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td>{campaign.name}</td>
              <td>{campaign.service}</td>
              <td>{campaign.region ?? <span className="muted">—</span>}</td>
              <td className="mono">{campaign.targetCount}</td>
              <td>
                <span className="tag">{campaign.status}</span>
              </td>
              <td>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={() =>
                      onAsk(
                        `Führe die Kampagne ${campaign.id} („${campaign.name}") aus: recherchiere passende Unternehmen und bereite die Entwürfe vor. Versende nichts.`,
                      )
                    }
                  >
                    Ausführen
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={async () => {
                      const result = await window.jarvis.campaigns.remove(campaign.id);
                      if (!result.ok) onError(result.error);
                      else await load();
                    }}
                  >
                    Löschen
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
