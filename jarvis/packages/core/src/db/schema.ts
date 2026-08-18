/**
 * Zeilentypen und Status-Vokabulare.
 *
 * In der Datenbank stehen maschinenlesbare Codes, in der Oberflaeche die
 * deutschen Beschriftungen aus dem Pflichtenheft. Beides wird hier einmal
 * definiert, damit UI, Agenten und Sprachausgabe dieselben Woerter benutzen.
 */

export const TARGET_STATUS = {
  neu: 'Neu',
  recherche: 'Recherche läuft',
  kontakt_gefunden: 'Kontakt gefunden',
  entwurf: 'Entwurf erstellt',
  wartet_auf_freigabe: 'Wartet auf Freigabe',
  freigegeben: 'Freigegeben',
  gesendet: 'Gesendet',
  fehler: 'Fehler',
  antwort_erhalten: 'Antwort erhalten',
} as const;

export type TargetStatus = keyof typeof TARGET_STATUS;

export const EMAIL_STATUS = {
  entwurf: 'Entwurf',
  wartet_auf_freigabe: 'Wartet auf Freigabe',
  freigegeben: 'Freigegeben',
  gesendet: 'Gesendet',
  fehlgeschlagen: 'Versand fehlgeschlagen',
  abgebrochen: 'Abgebrochen',
  eingegangen: 'Eingegangen',
} as const;

export type EmailStatus = keyof typeof EMAIL_STATUS;

export const VERIFICATION = {
  VERIFIZIERT: 'Verifiziert',
  WAHRSCHEINLICH: 'Wahrscheinlich',
  NICHT_VERIFIZIERT: 'Nicht verifiziert',
} as const;

export type VerificationStatus = keyof typeof VERIFICATION;

export const APPROVAL_STATUS = {
  offen: 'Wartet auf Freigabe',
  freigegeben: 'Freigegeben',
  abgelehnt: 'Abgelehnt',
  abgelaufen: 'Abgelaufen',
  ausgefuehrt: 'Ausgeführt',
  fehlgeschlagen: 'Fehlgeschlagen',
} as const;

export type ApprovalStatus = keyof typeof APPROVAL_STATUS;

export type SourceKind =
  | 'website'
  | 'impressum'
  | 'kontakt'
  | 'suchtreffer'
  | 'drittquelle'
  | 'manuell';

export type FactKind = 'FAKT' | 'KI_EINSCHAETZUNG';

// ---------------------------------------------------------------------------
// Zeilentypen (1:1 zum Schema)
// ---------------------------------------------------------------------------

export interface SourceRow {
  id: string;
  url: string;
  title: string | null;
  kind: SourceKind;
  http_status: number | null;
  fetched_at: string;
  snippet: string | null;
  content_hash: string | null;
}

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  domain: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  industry: string | null;
  size_hint: string | null;
  description: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactRow {
  id: string;
  company_id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  salutation: string | null;
  source_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailAddressRow {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  address: string;
  address_norm: string;
  kind: 'funktion' | 'person';
  verification: VerificationStatus;
  verify_note: string | null;
  mx_ok: number | null;
  source_id: string | null;
  found_on_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyFactRow {
  id: string;
  company_id: string;
  kind: FactKind;
  label: string;
  value: string;
  source_id: string | null;
  created_at: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  service: string;
  region: string | null;
  radius_km: number | null;
  goal_count: number;
  brief: string | null;
  sender_signature: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignTargetRow {
  id: string;
  campaign_id: string;
  company_id: string;
  email_id: string | null;
  status: TargetStatus;
  reason: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailRow {
  id: string;
  campaign_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  direction: 'ausgehend' | 'eingehend';
  to_address: string;
  to_name: string | null;
  cc: string | null;
  bcc: string | null;
  from_address: string | null;
  reply_to: string | null;
  subject: string;
  body_text: string;
  body_html: string | null;
  status: EmailStatus;
  approval_id: string | null;
  content_hash: string;
  provider: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  thread_key: string | null;
  error: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttachmentRow {
  id: string;
  email_id: string;
  filename: string;
  path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  action_type: string;
  title: string;
  summary: string;
  payload_json: string;
  content_hash: string | null;
  risk: 'niedrig' | 'mittel' | 'hoch';
  status: ApprovalStatus;
  requested_by: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  executed_at: string | null;
  result_json: string | null;
  expires_at: string | null;
}

export interface AuditRow {
  id: string;
  ts: string;
  actor: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  detail_json: string | null;
  outcome: 'ok' | 'fehler' | 'abgebrochen';
}

export interface SuppressionRow {
  id: string;
  scope: 'email' | 'domain' | 'firma';
  value_norm: string;
  reason: string | null;
  source: string | null;
  created_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  status: 'offen' | 'laeuft' | 'erledigt' | 'abgebrochen';
  due_at: string | null;
  notes: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryRow {
  id: string;
  kind: string;
  key: string;
  value: string;
  importance: number;
  source: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  agent: string | null;
  tool_calls_json: string | null;
  tool_call_id: string | null;
  created_at: string;
}

export interface InteractionRow {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  email_id: string | null;
  kind: string;
  direction: 'ausgehend' | 'eingehend';
  occurred_at: string;
  summary: string;
}

/** Deutsche Beschriftung zu einem Statuscode (fuer UI und Sprachausgabe). */
export function label(map: Record<string, string>, code: string): string {
  return map[code] ?? code;
}
