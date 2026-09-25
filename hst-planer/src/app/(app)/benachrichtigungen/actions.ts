'use server';

import { revalidatePath } from 'next/cache';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { markRead } from '@/lib/notify';

export interface Ergebnis { fehler?: string; hinweis?: string }

export async function gelesenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  const user = await seite();
  await markRead(user.id, [String(formData.get('id'))]);
  revalidatePath('/benachrichtigungen');
  return {};
}

export async function alleGelesenAktion(): Promise<Ergebnis> {
  const user = await seite();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath('/benachrichtigungen');
  return { hinweis: 'Alle Benachrichtigungen als gelesen markiert.' };
}
