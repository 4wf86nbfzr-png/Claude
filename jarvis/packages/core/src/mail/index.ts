import type { JarvisEnv } from '../config/env.js';
import type { CredentialService } from '../services/credentials.js';
import { GmailTransport } from './gmail.js';
import { GraphTransport } from './graph.js';
import { SmtpTransport } from './smtp.js';
import type { MailTransport } from './types.js';

export * from './types.js';
export { MailService, isPlausibleAddress } from './service.js';
export type { DraftRequest, DraftView } from './service.js';
export { SmtpTransport } from './smtp.js';
export { GmailTransport } from './gmail.js';
export { GraphTransport } from './graph.js';
export { ImapReader } from './imap.js';
export { OAuthClient } from './oauth.js';
export { buildMime, toBase64Url } from './mime.js';

export function createMailTransport(env: JarvisEnv, credentials: CredentialService): MailTransport | null {
  switch (env.JARVIS_MAIL_TRANSPORT) {
    case 'smtp':
      return new SmtpTransport(env, credentials);
    case 'gmail':
      return new GmailTransport(env, credentials);
    case 'graph':
      return new GraphTransport(env, credentials);
    default:
      return null;
  }
}

/** Alle Transporte mit ihrem Einrichtungsstand -- fuer den Setup-Assistenten. */
export function allTransports(env: JarvisEnv, credentials: CredentialService): MailTransport[] {
  return [new SmtpTransport(env, credentials), new GmailTransport(env, credentials), new GraphTransport(env, credentials)];
}
