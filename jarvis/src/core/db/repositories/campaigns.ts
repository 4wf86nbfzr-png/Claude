import { Db, nowIso } from '../database';
import type { Campaign, OutreachRow } from '../../../shared/types';
import { ApprovalStatus, EmailStatus, OutreachStatus, VerificationStatus } from '../../../shared/status';

export interface CampaignInput {
  name: string;
  service: string;
  region?: string | null;
  radiusKm?: number | null;
  targetCount?: number | null;
  goal?: string | null;
}

const map = (row: Record<string, unknown>): Campaign => ({
  id: Number(row.id),
  name: String(row.name),
  service: String(row.service),
  region: (row.region as string | null) ?? null,
  radiusKm: row.radius_km === null ? null : Number(row.radius_km),
  targetCount: row.target_count === null ? null : Number(row.target_count),
  goal: (row.goal as string | null) ?? null,
  status: String(row.status) as Campaign['status'],
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export class CampaignRepo {
  constructor(private readonly db: Db) {}

  create(input: CampaignInput): Campaign {
    const existing = this.byName(input.name);
    if (existing) return existing;
    const ts = nowIso();
    const { lastInsertRowid } = this.db.run(
      `INSERT INTO outreach_campaigns (name, service, region, radius_km, target_count, goal, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'AKTIV', ?, ?)`,
      [
        input.name.trim(),
        input.service.trim(),
        input.region ?? null,
        input.radiusKm ?? null,
        input.targetCount ?? null,
        input.goal ?? null,
        ts,
        ts
      ]
    );
    return this.byId(lastInsertRowid)!;
  }

  byId(id: number): Campaign | null {
    const row = this.db.get('SELECT * FROM outreach_campaigns WHERE id = ?', [id]);
    return row ? map(row) : null;
  }

  byName(name: string): Campaign | null {
    const row = this.db.get('SELECT * FROM outreach_campaigns WHERE name = ?', [name.trim()]);
    return row ? map(row) : null;
  }

  list(): Campaign[] {
    return this.db.all('SELECT * FROM outreach_campaigns ORDER BY updated_at DESC').map(map);
  }

  setStatus(id: number, status: Campaign['status']): void {
    this.db.run('UPDATE outreach_campaigns SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
  }

  /** Unternehmen einer Kampagne zuordnen (idempotent). */
  addTarget(campaignId: number, companyId: number, reason?: string | null): number {
    const existing = this.db.get<{ id: number }>(
      'SELECT id FROM campaign_targets WHERE campaign_id = ? AND company_id = ?',
      [campaignId, companyId]
    );
    if (existing) {
      if (reason) {
        this.db.run('UPDATE campaign_targets SET reason = COALESCE(reason, ?), updated_at = ? WHERE id = ?', [
          reason,
          nowIso(),
          Number(existing.id)
        ]);
      }
      return Number(existing.id);
    }
    const ts = nowIso();
    const { lastInsertRowid } = this.db.run(
      `INSERT INTO campaign_targets (campaign_id, company_id, status, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [campaignId, companyId, OutreachStatus.NEU, reason ?? null, ts, ts]
    );
    return lastInsertRowid;
  }

  setTargetStatus(
    campaignId: number,
    companyId: number,
    status: OutreachStatus,
    extra: { reason?: string | null; emailId?: number | null; lastError?: string | null } = {}
  ): void {
    const sets = ['status = ?', 'updated_at = ?'];
    const values: (string | number | null)[] = [status, nowIso()];
    if (extra.reason !== undefined) {
      sets.push('reason = ?');
      values.push(extra.reason);
    }
    if (extra.emailId !== undefined) {
      sets.push('email_id = ?');
      values.push(extra.emailId);
    }
    if (extra.lastError !== undefined) {
      sets.push('last_error = ?');
      values.push(extra.lastError);
    }
    this.db.run(`UPDATE campaign_targets SET ${sets.join(', ')} WHERE campaign_id = ? AND company_id = ?`, [
      ...values,
      campaignId,
      companyId
    ]);
  }

  targetCompanyIds(campaignId: number): number[] {
    return this.db
      .all<{ company_id: number }>('SELECT company_id FROM campaign_targets WHERE campaign_id = ?', [campaignId])
      .map((row) => Number(row.company_id));
  }

  /**
   * Die Versandzentrale (§6). Eine Zeile je Kampagnen-Unternehmen mit allem,
   * was für die Freigabeentscheidung nötig ist – inklusive Quelle und
   * Verifizierungsgrad der Adresse.
   */
  outreachRows(filter: { campaignId?: number; status?: OutreachStatus; limit?: number } = {}): OutreachRow[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.campaignId !== undefined) {
      where.push('t.campaign_id = ?');
      params.push(filter.campaignId);
    }
    if (filter.status) {
      where.push('t.status = ?');
      params.push(filter.status);
    }
    params.push(filter.limit ?? 500);
    return this.db
      .all(
        `SELECT
            t.id, t.campaign_id, t.company_id, t.status, t.reason, t.email_id, t.last_error, t.updated_at,
            k.name AS campaign_name,
            c.name AS company,
            ea.address AS email, ea.verification_status, ea.evidence_url,
            ct.full_name AS contact_name, ct.role AS contact_role,
            e.status AS email_status, e.approval_id, e.sent_at,
            a.status AS approval_status,
            (SELECT MAX(sent_at) FROM emails WHERE company_id = t.company_id AND direction = 'AUSGEHEND' AND status = '${EmailStatus.GESENDET}') AS last_contact
          FROM campaign_targets t
          JOIN outreach_campaigns k ON k.id = t.campaign_id
          JOIN companies c ON c.id = t.company_id
          LEFT JOIN emails e ON e.id = t.email_id
          LEFT JOIN approvals a ON a.id = e.approval_id
          LEFT JOIN contacts ct ON ct.id = e.contact_id
          LEFT JOIN email_addresses ea ON ea.id = (
             SELECT id FROM email_addresses x WHERE x.company_id = t.company_id
              ORDER BY CASE x.verification_status WHEN 'VERIFIZIERT' THEN 0 WHEN 'WAHRSCHEINLICH' THEN 1 ELSE 2 END,
                       CASE WHEN x.contact_id IS NULL THEN 1 ELSE 0 END, x.id LIMIT 1)
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY t.id DESC LIMIT ?`,
        params
      )
      .map((row) => ({
        id: Number(row.id),
        campaignId: Number(row.campaign_id),
        campaignName: String(row.campaign_name),
        companyId: Number(row.company_id),
        company: String(row.company),
        contactName: (row.contact_name as string | null) ?? null,
        contactRole: (row.contact_role as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        verification: (row.verification_status as VerificationStatus | null) ?? null,
        sourceUrl: (row.evidence_url as string | null) ?? null,
        reason: (row.reason as string | null) ?? null,
        status: String(row.status) as OutreachStatus,
        emailId: row.email_id === null ? null : Number(row.email_id),
        emailStatus: (row.email_status as EmailStatus | null) ?? null,
        approvalId: row.approval_id === null ? null : Number(row.approval_id),
        approvalStatus: (row.approval_status as ApprovalStatus | null) ?? null,
        lastContactAt: (row.last_contact as string | null) ?? null,
        lastError: (row.last_error as string | null) ?? null,
        updatedAt: String(row.updated_at)
      }));
  }
}
