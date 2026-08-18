/**
 * Kampagnen.
 *
 * Anlegen und starten. Der Start fährt Recherche und Entwürfe durch —
 * versendet aber nichts; das bleibt der Freigabe vorbehalten.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { Campaign } from '@shared/types'

interface CampaignsViewProps {
  dataVersion: number
  onError(message: string, hint?: string): void
  onOpenSendCenter(): void
}

const EMPTY = { name: '', service: '', region: '', targetCount: 20, radiusKm: 50, briefing: '' }

export function CampaignsView({ dataVersion, onError, onOpenSendCenter }: CampaignsViewProps): ReactElement {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setCampaigns(await window.jarvis.campaigns.list())
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  const create = async (): Promise<void> => {
    if (!form.name.trim() || !form.service.trim() || !form.region.trim()) {
      onError('Name, Leistung und Region werden gebraucht.')
      return
    }
    setBusy(true)
    const result = await window.jarvis.campaigns.create({
      name: form.name.trim(),
      service: form.service.trim(),
      region: form.region.trim(),
      targetCount: Number(form.targetCount) || 20,
      radiusKm: Number(form.radiusKm) || null,
      briefing: form.briefing.trim() || null
    })
    setBusy(false)
    if (!result.ok) onError(result.error, result.hint)
    else setForm(EMPTY)
    await load()
  }

  const run = async (id: number): Promise<void> => {
    const result = await window.jarvis.campaigns.run(id)
    if (!result.ok) onError(result.error, result.hint)
    else onOpenSendCenter()
  }

  return (
    <div className="view enter">
      <h2 className="view__title">Kampagnen</h2>

      <p className="inline-note">
        Der Start recherchiert Firmen und schreibt je Firma einen eigenen Entwurf. Es wird nichts versendet — jeder
        Versand braucht anschließend Ihre Freigabe.
      </p>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="c-name">Name der Kampagne</label>
          <input
            id="c-name"
            value={form.name}
            placeholder="Hamburger Bauunternehmen"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="c-service">Dienstleistung</label>
          <input
            id="c-service"
            value={form.service}
            placeholder="24/7 Baustellenbewachung und Alarmüberwachung"
            onChange={(event) => setForm({ ...form, service: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="c-region">Region</label>
          <input
            id="c-region"
            value={form.region}
            placeholder="Hamburg"
            onChange={(event) => setForm({ ...form, region: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="c-radius">Umkreis in km</label>
          <input
            id="c-radius"
            type="number"
            min={0}
            value={form.radiusKm}
            onChange={(event) => setForm({ ...form, radiusKm: Number(event.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="c-target">Ziel: qualifizierte Unternehmen</label>
          <input
            id="c-target"
            type="number"
            min={1}
            max={200}
            value={form.targetCount}
            onChange={(event) => setForm({ ...form, targetCount: Number(event.target.value) })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="c-brief">Hinweise für die Texte</label>
        <textarea
          id="c-brief"
          rows={3}
          value={form.briefing}
          placeholder="Worauf soll in den Mails eingegangen werden?"
          onChange={(event) => setForm({ ...form, briefing: event.target.value })}
        />
      </div>

      <button type="button" className="btn btn--primary" onClick={create} disabled={busy}>
        Kampagne anlegen
      </button>

      <div className="section">
        <h3>Angelegte Kampagnen</h3>
        {campaigns.length === 0 ? (
          <p className="empty">Noch keine Kampagne.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Leistung</th>
                  <th>Region</th>
                  <th>Ziel</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>{campaign.name}</td>
                    <td>{campaign.service}</td>
                    <td>
                      {campaign.region}
                      {campaign.radiusKm ? <span className="cell-sub"> + {campaign.radiusKm} km</span> : null}
                    </td>
                    <td>{campaign.targetCount}</td>
                    <td>{campaign.status}</td>
                    <td>
                      <button type="button" className="btn" onClick={() => void run(campaign.id)}>
                        Recherche und Entwürfe starten
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
