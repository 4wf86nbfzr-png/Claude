import type { JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { AuditLogService } from '../services/AuditLogService.js';

/**
 * Everything the core needs from the host OS, injected by the Electron main
 * process. Keeping it behind an interface is what lets the core run (and be
 * tested) outside Electron.
 */
export interface SystemBridge {
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
  writeClipboard(text: string): void;
  readClipboard(): string;
  /** Launches a desktop application by name/bundle id. */
  launchApplication(name: string): Promise<Result<string, JarvisError>>;
  platform: NodeJS.Platform;
  appVersion: string;
  electronVersion: string;
}

export interface SystemAgentDeps {
  bridge: SystemBridge;
  audit: AuditLogService;
}

/**
 * Computer control (§12).
 *
 * Order of preference, as specified: official interfaces first — `shell.open*`
 * and the platform launcher — and no synthetic mouse or keyboard input at all.
 * Version 1 deliberately ships without screen automation; adding it would mean
 * a new agent behind the same approval engine.
 */
export class SystemAgent {
  readonly name = 'SystemAgent';

  constructor(private readonly deps: SystemAgentDeps) {}

  async openWebsite(url: string): Promise<Result<string, JarvisError>> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return err(makeError('system.bad_url', `„${url}" ist keine gültige Adresse.`));
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return err(
        makeError('system.bad_scheme', `Nur http und https werden geöffnet, nicht ${parsed.protocol}.`),
      );
    }
    await this.deps.bridge.openExternal(parsed.toString());
    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'browser.geoeffnet',
      subject: parsed.toString(),
      outcome: 'ok',
    });
    return ok(`${parsed.host} im Standardbrowser geöffnet.`);
  }

  async openPath(path: string): Promise<Result<string, JarvisError>> {
    const message = await this.deps.bridge.openPath(path);
    if (message) {
      return err(makeError('system.open_failed', `${path} konnte nicht geöffnet werden.`, { detail: message }));
    }
    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'pfad.geoeffnet',
      subject: path,
      outcome: 'ok',
    });
    return ok(`${path} geöffnet.`);
  }

  async openApplication(name: string): Promise<Result<string, JarvisError>> {
    const result = await this.deps.bridge.launchApplication(name);
    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'programm.gestartet',
      subject: name,
      outcome: result.ok ? 'ok' : 'fehler',
      detail: result.ok ? result.value : result.error.message,
    });
    return result;
  }

  copyToClipboard(text: string): Result<string, JarvisError> {
    this.deps.bridge.writeClipboard(text);
    return ok(`${text.length} Zeichen in die Zwischenablage kopiert.`);
  }

  readClipboard(): Result<string, JarvisError> {
    return ok(this.deps.bridge.readClipboard());
  }
}
