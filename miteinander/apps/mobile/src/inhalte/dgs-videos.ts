/**
 * Zuordnung Kernablauf -> Videodatei.
 *
 * ERZEUGT von tools/dgs-platzhalter.mjs -- nicht von Hand aendern.
 *
 * Es sind gekennzeichnete Platzhalter, keine Gebärdensprach-Aufnahmen.
 * Sobald echte Videos vorliegen, werden die Dateien in assets/dgs/
 * ersetzt und im Adminbereich freigegeben; diese Datei bleibt gleich.
 */
export const DGS_VIDEOS: Record<string, number> = {
  'onboarding.welcome': require('../../assets/dgs/onboarding.welcome.webm') as number,
  'onboarding.mode_choice': require('../../assets/dgs/onboarding.mode_choice.webm') as number,
  'onboarding.accessibility': require('../../assets/dgs/onboarding.accessibility.webm') as number,
  'profile.create': require('../../assets/dgs/profile.create.webm') as number,
  'search.overview': require('../../assets/dgs/search.overview.webm') as number,
  'request.step.what': require('../../assets/dgs/request.step.what.webm') as number,
  'request.step.when': require('../../assets/dgs/request.step.when.webm') as number,
  'request.step.where': require('../../assets/dgs/request.step.where.webm') as number,
  'request.step.important': require('../../assets/dgs/request.step.important.webm') as number,
  'request.summary': require('../../assets/dgs/request.summary.webm') as number,
  'provider.profile_explained': require('../../assets/dgs/provider.profile_explained.webm') as number,
  'booking.summary': require('../../assets/dgs/booking.summary.webm') as number,
  'booking.cancellation': require('../../assets/dgs/booking.cancellation.webm') as number,
  'payment.overview': require('../../assets/dgs/payment.overview.webm') as number,
  'complaint.how_to': require('../../assets/dgs/complaint.how_to.webm') as number,
  'safety.emergency': require('../../assets/dgs/safety.emergency.webm') as number,
  'privacy.overview': require('../../assets/dgs/privacy.overview.webm') as number,
  'help.overview': require('../../assets/dgs/help.overview.webm') as number,
};

/** Ist für diesen Ablauf überhaupt eine Datei hinterlegt? */
export function dgsVideoQuelle(key: string): number | undefined {
  return DGS_VIDEOS[key];
}
