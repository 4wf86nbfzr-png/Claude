import { ipcMain, shell, type BrowserWindow } from 'electron';
import { KANAL, type FreigabeAnsicht } from '../shared/ipc';
import type { EmailStatus, OutreachStatus } from '../shared/status';
import type { Kernel } from '../core/kernel';
import { GMAIL_SCOPES, GmailTransport, CALENDAR_SCOPES } from '../core/services/mail';
import { GoogleOAuthClient } from '../core/services/mail/googleOAuth';

/**
 * Alle IPC-Empfänger an einer Stelle.
 *
 * Jeder Kanal reicht die Anfrage an den Kern weiter und gibt einfache,
 * serialisierbare Daten zurück. Fehler werden als Ergebnis gemeldet, nicht
 * als geworfene Ausnahme – sonst sieht der Benutzer nur ein stummes Fenster.
 */
export function registriereIpc(kernel: Kernel, fenster: () => BrowserWindow | null): void {
  const behandeln = <T extends unknown[], R>(kanal: string, fn: (...args: T) => Promise<R> | R) => {
    ipcMain.handle(kanal, async (_event, ...args) => {
      try {
        return await fn(...(args as T));
      } catch (error) {
        kernel.audit.log('IPC-Aufruf fehlgeschlagen', {
          actor: 'SYSTEM',
          target: kanal,
          status: 'FEHLER',
          detail: { fehler: (error as Error).message }
        });
        throw error;
      }
    });
  };

  behandeln(KANAL.senden, (text: string) => kernel.core.verarbeite(text));
  behandeln(KANAL.verlauf, () => kernel.core.verlauf());
  behandeln(KANAL.status, () => kernel.core.status());
  behandeln(KANAL.vorlesetext, (emailId: number) => kernel.core.vorlesetext(emailId));

  behandeln(KANAL.freigabenOffen, (): FreigabeAnsicht[] => kernel.core.offeneFreigaben());
  behandeln(KANAL.freigabeEntscheiden, (approvalId: number, freigegeben: boolean, notiz?: string) =>
    kernel.core.genehmige(approvalId, freigegeben, notiz)
  );
  behandeln(KANAL.freigabenVerlauf, (limit?: number) => kernel.approvals.history(limit ?? 50));

  behandeln(KANAL.versandzentrale, (filter?: { campaignId?: number; status?: string }) =>
    kernel.repos.campaigns.outreachRows({
      ...(filter?.campaignId !== undefined ? { campaignId: filter.campaignId } : {}),
      ...(filter?.status ? { status: filter.status as OutreachStatus } : {})
    })
  );
  behandeln(KANAL.kampagnen, () => kernel.repos.campaigns.list());
  behandeln(KANAL.unternehmen, (suche?: string) =>
    suche ? kernel.repos.companies.search(suche) : kernel.repos.companies.list(100)
  );

  behandeln(KANAL.entwuerfe, (status?: string) =>
    kernel.repos.emails.list({ ...(status ? { status: status as EmailStatus } : {}), limit: 100 })
  );
  behandeln(KANAL.entwurfLesen, (emailId: number) => kernel.repos.emails.byId(emailId));
  behandeln(
    KANAL.entwurfAendern,
    (emailId: number, patch: { subject?: string; bodyText?: string; to?: string[] }) =>
      kernel.repos.emails.updateDraft(emailId, patch)
  );
  behandeln(KANAL.freigabeAnfordern, async (emailId: number) => {
    const ergebnis = await kernel.registry.run(
      'request_send_approval',
      { emailId },
      {
        repos: kernel.repos,
        config: kernel.config,
        credentials: kernel.credentials,
        audit: kernel.audit,
        approvals: kernel.approvals,
        bus: kernel.bus,
        llm: kernel.llm,
        mail: kernel.mail,
        research: kernel.research,
        system: kernel.system,
        sessionId: kernel.core.sessionId
      }
    );
    return {
      ok: ergebnis.ok,
      meldung: ergebnis.summary,
      ...(ergebnis.approvalId ? { approvalId: ergebnis.approvalId } : {})
    };
  });

  behandeln(KANAL.protokoll, (limit?: number) => kernel.audit.recent(limit ?? 200));
  behandeln(KANAL.gedaechtnis, () => kernel.repos.memory.list());
  behandeln(KANAL.gedaechtnisLoeschen, (id: number) => kernel.repos.memory.forget(id));
  behandeln(KANAL.verlaufLoeschen, () => kernel.repos.conversation.clear());

  behandeln(KANAL.sperrliste, () => kernel.repos.suppression.list());
  behandeln(KANAL.sperrlisteHinzu, (wert: string, art: 'adresse' | 'domain', grund?: string) =>
    kernel.repos.suppression.add(wert, art, grund)
  );
  behandeln(KANAL.sperrlisteEntfernen, (id: number) => kernel.repos.suppression.remove(id));

  behandeln(KANAL.zugangsdaten, () => ({
    eintraege: kernel.credentials.describe(),
    tresor: kernel.credentials.vaultLabel
  }));
  behandeln(KANAL.zugangsdatenSetzen, (name: string, wert: string) => {
    try {
      kernel.credentials.set(name, wert);
      kernel.audit.log('Zugangsdaten hinterlegt', { actor: 'BENUTZER', target: name, status: 'OK' });
      return {
        ok: true,
        meldung: `${name} wurde im Tresor gespeichert. Bitte JARVIS neu starten, damit der Wert überall greift.`
      };
    } catch (error) {
      return { ok: false, meldung: (error as Error).message };
    }
  });
  behandeln(KANAL.zugangsdatenEntfernen, (name: string) => {
    kernel.credentials.remove(name);
    kernel.audit.log('Zugangsdaten entfernt', { actor: 'BENUTZER', target: name, status: 'OK' });
    return { ok: true };
  });

  behandeln(KANAL.googleVerbinden, async () => {
    const oauth = new GoogleOAuthClient(
      kernel.credentials.get('GOOGLE_CLIENT_ID'),
      kernel.credentials.get('GOOGLE_CLIENT_SECRET')
    );
    if (!oauth.configured()) return { ok: false, meldung: oauth.missingHint() };
    try {
      const transport = new GmailTransport(kernel.credentials, oauth);
      await transport.verbinden((url) => void shell.openExternal(url), [...GMAIL_SCOPES, ...CALENDAR_SCOPES]);
      kernel.audit.log('Mit Google verbunden', { actor: 'BENUTZER', status: 'OK' });
      return { ok: true, meldung: 'Verbindung hergestellt. Bitte JARVIS neu starten.' };
    } catch (error) {
      return { ok: false, meldung: `Verbindung fehlgeschlagen: ${(error as Error).message}` };
    }
  });

  behandeln(KANAL.transkribieren, async (audio: ArrayBuffer, mimeType: string) => {
    try {
      const ergebnis = await kernel.voice.transkribiere(Buffer.from(audio), mimeType);
      return { text: ergebnis.text, imFenster: Boolean(ergebnis.imFenster) };
    } catch (error) {
      return { text: '', imFenster: false, fehler: (error as Error).message };
    }
  });

  behandeln(KANAL.sprechen, async (text: string) => {
    try {
      const ergebnis = await kernel.voice.sprich(text);
      if ('imFenster' in ergebnis && ergebnis.imFenster) return { imFenster: true };
      const audio = (ergebnis as { audio: Buffer; mimeType: string }).audio;
      return {
        imFenster: false,
        audioBase64: audio.toString('base64'),
        mimeType: (ergebnis as { mimeType: string }).mimeType
      };
    } catch (error) {
      return { imFenster: true, fehler: (error as Error).message };
    }
  });

  // Ereignisse des Kerns an das Fenster weiterreichen.
  kernel.bus.subscribe((event) => {
    const ziel = fenster();
    if (ziel && !ziel.isDestroyed()) ziel.webContents.send(KANAL.ereignis, event);
  });
}
