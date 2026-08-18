/**
 * Versandzentrale.
 *
 * Eine Zeile je Vorgang mit genau den Spalten aus der Anforderung:
 * Unternehmen, Ansprechpartner, E-Mail, Quelle, Verifizierungsstatus,
 * Akquisegrund, Mailstatus, letzter Kontakt, Freigabestatus.
 */
import { getApproval } from '../db/repos/system'
import {
  bestEmailAddress,
  getCompany,
  getSource,
  listCompanies,
  listContacts,
  listEmailAddresses
} from '../db/repos/companies'
import { getCampaign, listEmails } from '../db/repos/outreach'
import type { SendCenterFilter } from '@shared/ipc'
import type { EmailStatus, SendCenterRow } from '@shared/types'

const MAIL_STATUSES: EmailStatus[] = ['entwurf', 'wartet_auf_freigabe', 'freigegeben', 'gesendet', 'fehler']

function sourceUrlFor(companyId: number, address: string | null): string | null {
  if (!address) return null
  const entry = listEmailAddresses(companyId).find((a) => a.address === address)
  if (!entry?.sourceId) return null
  return getSource(entry.sourceId)?.url ?? null
}

export function listSendCenter(filter: SendCenterFilter = {}): SendCenterRow[] {
  const rows: SendCenterRow[] = []
  const withEmail = new Set<number>()

  const mailStatus = filter.status && MAIL_STATUSES.includes(filter.status as EmailStatus) ? filter.status : undefined

  for (const email of listEmails({ status: mailStatus, campaignId: filter.campaignId })) {
    const company = email.companyId ? getCompany(email.companyId) : null
    const contact = email.companyId ? listContacts(email.companyId)[0] : undefined
    const approval = email.approvalId ? getApproval(email.approvalId) : null
    const campaign = email.campaignId ? getCampaign(email.campaignId) : null

    if (email.companyId) withEmail.add(email.companyId)

    rows.push({
      companyId: email.companyId ?? 0,
      emailId: email.id,
      company: company?.name ?? email.toName ?? email.toAddress,
      contact: contact?.fullName ?? email.toName ?? null,
      address: email.toAddress,
      sourceUrl: email.companyId ? sourceUrlFor(email.companyId, email.toAddress) : null,
      verification: email.recipientVerification,
      acquisitionReason: company?.acquisitionReason ?? null,
      mailStatus: email.status,
      lastContactAt: company?.lastContactedAt ?? email.sentAt,
      approvalStatus: approval?.status ?? 'keine',
      campaignId: email.campaignId,
      campaignName: campaign?.name ?? null,
      outreachStatus: company?.status ?? 'neu',
      subject: email.subject,
      doNotContact: company?.doNotContact ?? false
    })
  }

  // Firmen ohne Entwurf gehören ebenfalls in die Uebersicht — sonst sieht man
  // nicht, wofür noch etwas fehlt. Bei gesetztem Mailstatus-Filter entfallen sie.
  if (!mailStatus) {
    for (const company of listCompanies(undefined, 1000)) {
      if (withEmail.has(company.id)) continue
      if (filter.campaignId !== undefined) continue

      const address = bestEmailAddress(company.id)
      const contact = listContacts(company.id)[0]

      rows.push({
        companyId: company.id,
        emailId: null,
        company: company.name,
        contact: contact?.fullName ?? null,
        address: address?.address ?? null,
        sourceUrl: address ? sourceUrlFor(company.id, address.address) : null,
        verification: address?.status ?? null,
        acquisitionReason: company.acquisitionReason,
        mailStatus: null,
        lastContactAt: company.lastContactedAt,
        approvalStatus: 'keine',
        campaignId: null,
        campaignName: null,
        outreachStatus: company.status,
        subject: null,
        doNotContact: company.doNotContact
      })
    }
  }

  let out = rows
  if (filter.status && !mailStatus) {
    out = out.filter((row) => row.outreachStatus === filter.status)
  }
  if (filter.search) {
    const needle = filter.search.toLowerCase()
    out = out.filter((row) =>
      [row.company, row.contact, row.address, row.subject, row.acquisitionReason]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(needle))
    )
  }

  out.sort((a, b) => (b.lastContactAt ?? '').localeCompare(a.lastContactAt ?? '') || b.companyId - a.companyId)
  return out.slice(0, filter.limit ?? 500)
}
