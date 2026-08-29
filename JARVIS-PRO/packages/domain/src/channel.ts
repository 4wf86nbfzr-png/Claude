import { z } from 'zod';

/** Kanaele, ueber die Jarvis Nachrichten empfaengt bzw. (nur nach Freigabe) sendet. */
export const ChannelSchema = z.enum(['email', 'whatsapp']);
export type Channel = z.infer<typeof ChannelSchema>;

export const UrgencySchema = z.enum(['low', 'normal', 'high']);
export type Urgency = z.infer<typeof UrgencySchema>;

export const CHANNEL_LABEL_DE: Record<Channel, string> = {
  email: 'E-Mail',
  whatsapp: 'WhatsApp Business',
};
