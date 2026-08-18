import type { Db } from '../database.js';
import type { CampaignRow, CampaignTargetRow, TargetStatus } from '../schema.js';
import { newId, nowIso } from '../../util/text.js';

export interface CampaignInput {
  name: string;
  service: string;
  region?: string | null;
  radiusKm?: number | null;
  goalCount?: number;
  brief?: string | null;
  senderSignature?: string | null;
}

/** Zeile der Versandzentrale -- eine Firma innerhalb einer Kampagne. */
export interface TargetView {
  target: CampaignTargetRow;
  companyName: string;
  companyWebsite: string | null;
  city: string | null;
  contactName: string | null;
  contactRole: string | null;
  email: string | null;
  verification: string | null;
  sourceUrl: string | null;
  emailStatus: string | null;
  emailSubject: string | null;
  approvalId: string | null;
  approvalStatus: string | null;
  lastContactAt: string | null;
}

export class CampaignRepo {
  constructor(private readonly db: Db) {}

  create(input: CampaignInput): CampaignRow {
    const ts = nowIso();
    const row: CampaignRow = {
      id: newId('camp'),
      name: input.name,
      service: input.service,
      region: input.region ?? null,
      radius_km: input.radiusKm ?? null,
      goal_count: input.goalCount ?? 20,
      brief: input.brief ?? null,
      sender_signature: input.senderSignature ?? null,
      status: 'neu',
      created_at: ts,
      updated_at: ts,
    };
    this.db
      .prepare(
        `INSERT INTO outreach_campaigns (id, name, service, region, radius_km, goal_count, brief,
            sender_signature, status, created_at, updated_at)
         VALUES (@id, @name, @service, @region, @radius_km, @goal_count, @brief,
            @sender_signature, @status, @created_at, @updated_at)`,
      )
      .run(row);
    return row;
  }

  get(id: string): CampaignRow | undefined {
    return this.db.prepare('SELECT * FROM outreach_campaigns WHERE id = ?').get(id) as
      | CampaignRow
      | undefined;
  }

  findByName(name: string): CampaignRow | undefined {
    return this.db
      .prepare('SELECT * FROM outreach_campaigns WHERE LOWER(name) = LOWER(?)')
      .get(name.trim()) as CampaignRow | undefined;
  }

  list(limit = 50): CampaignRow[] {
    return this.db
      .prepare('SELECT * FROM outreach_campaigns ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as CampaignRow[];
  }

  setStatus(id: string, status: string): void {
    this.db
      .prepare('UPDATE outreach_campaigns SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, nowIso(), id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM outreach_campaigns WHERE id = ?').run(id).changes > 0;
  }

  // --- Ziele --------------------------------------------------------------

  addTarget(campaignId: string, companyId: string, reason?: string | null): CampaignTargetRow {
    const existing = this.db
      .prepare('SELECT * FROM campaign_targets WHERE campaign_id = ? AND company_id = ?')
      .get(campaignId, companyId) as CampaignTargetRow | undefined;
    if (existing) return existing;

    const ts = nowIso();
    const row: CampaignTargetRow = {
      id: newId('tgt'),
      campaign_id: campaignId,
      company_id: companyId,
      email_id: null,
      status: 'neu',
      reason: reason ?? null,
      last_error: null,
      created_at: ts,
      updated_at: ts,
    };
    this.db
      .prepare(
        `INSERT INTO campaign_targets (id, campaign_id, company_id, email_id, status, reason,
            last_error, created_at, updated_at)
         VALUES (@id, @campaign_id, @company_id, @email_id, @status, @reason, @last_error, @created_at, @updated_at)`,
      )
      .run(row);
    return row;
  }

  getTarget(id: string): CampaignTargetRow | undefined {
    return this.db.prepare('SELECT * FROM campaign_targets WHERE id = ?').get(id) as
      | CampaignTargetRow
      | undefined;
  }

  findTargetByEmail(emailId: string): CampaignTargetRow | undefined {
    return this.db.prepare('SELECT * FROM campaign_targets WHERE email_id = ?').get(emailId) as
      | CampaignTargetRow
      | undefined;
  }

  findTargetByCompany(campaignId: string, companyId: string): CampaignTargetRow | undefined {
    return this.db
      .prepare('SELECT * FROM campaign_targets WHERE campaign_id = ? AND company_id = ?')
      .get(campaignId, companyId) as CampaignTargetRow | undefined;
  }

  updateTarget(
    id: string,
    patch: Partial<Pick<CampaignTargetRow, 'status' | 'reason' | 'email_id' | 'last_error'>>,
  ): void {
    const current = this.getTarget(id);
    if (!current) return;
    const next = { ...current, ...patch, updated_at: nowIso() };
    this.db
      .prepare(
        `UPDATE campaign_targets SET status=@status, reason=@reason, email_id=@email_id,
           last_error=@last_error, updated_at=@updated_at WHERE id=@id`,
      )
      .run(next);
  }

  setTargetStatus(id: string, status: TargetStatus, error?: string | null): void {
    this.updateTarget(id, { status, last_error: error ?? null });
  }

  /**
   * Die Versandzentrale: eine Zeile je Firma mit allen Spalten aus dem
   * Pflichtenheft. Bewusst ein einzelnes JOIN-Statement, damit die Tabelle in
   * der Oberflaeche in einem Zug geladen werden kann.
   */
  overview(filter: { campaignId?: string; status?: TargetStatus[]; limit?: number } = {}): TargetView[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.campaignId) {
      where.push('t.campaign_id = @campaignId');
      params.campaignId = filter.campaignId;
    }
    if (filter.status?.length) {
      where.push(`t.status IN (${filter.status.map((_, i) => `@st${i}`).join(',')})`);
      filter.status.forEach((s, i) => (params[`st${i}`] = s));
    }
    params.limit = filter.limit ?? 500;

    const rows = this.db
      .prepare(
        `SELECT
            t.*,
            c.name AS company_name, c.website AS company_website, c.city AS city,
            ct.full_name AS contact_name, ct.role AS contact_role,
            ea.address AS email_address, ea.verification AS verification,
            COALESCE(s.url, ea.found_on_url) AS source_url,
            m.status AS email_status, m.subject AS email_subject, m.approval_id AS approval_id,
            a.status AS approval_status,
            (SELECT MAX(occurred_at) FROM interaction_history ih WHERE ih.company_id = c.id) AS last_contact_at
         FROM campaign_targets t
         JOIN companies c ON c.id = t.company_id
         LEFT JOIN emails m ON m.id = t.email_id
         LEFT JOIN contacts ct ON ct.id = m.contact_id
         LEFT JOIN email_addresses ea ON ea.company_id = c.id AND (
              m.to_address IS NULL OR LOWER(ea.address_norm) = LOWER(m.to_address)
         )
         LEFT JOIN sources s ON s.id = ea.source_id
         LEFT JOIN approvals a ON a.id = m.approval_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         GROUP BY t.id
         ORDER BY t.updated_at DESC
         LIMIT @limit`,
      )
      .all(params) as Array<CampaignTargetRow & Record<string, unknown>>;

    return rows.map((r) => ({
      target: {
        id: r.id,
        campaign_id: r.campaign_id,
        company_id: r.company_id,
        email_id: r.email_id,
        status: r.status,
        reason: r.reason,
        last_error: r.last_error,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
      companyName: String(r.company_name ?? ''),
      companyWebsite: (r.company_website as string | null) ?? null,
      city: (r.city as string | null) ?? null,
      contactName: (r.contact_name as string | null) ?? null,
      contactRole: (r.contact_role as string | null) ?? null,
      email: (r.email_address as string | null) ?? null,
      verification: (r.verification as string | null) ?? null,
      sourceUrl: (r.source_url as string | null) ?? null,
      emailStatus: (r.email_status as string | null) ?? null,
      emailSubject: (r.email_subject as string | null) ?? null,
      approvalId: (r.approval_id as string | null) ?? null,
      approvalStatus: (r.approval_status as string | null) ?? null,
      lastContactAt: (r.last_contact_at as string | null) ?? null,
    }));
  }

  countByStatus(campaignId: string): Record<string, number> {
    const rows = this.db
      .prepare('SELECT status, COUNT(*) AS n FROM campaign_targets WHERE campaign_id = ? GROUP BY status')
      .all(campaignId) as Array<{ status: string; n: number }>;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = r.n;
    return out;
  }
}
