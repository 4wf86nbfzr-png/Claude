import { promises as fs } from 'node:fs';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { ApprovalService } from '../services/ApprovalService.js';
import type { AuditLogService } from '../services/AuditLogService.js';
import type { SettingsService } from '../services/SettingsService.js';
import { fingerprint } from '../util/id.js';

export interface FileAgentDeps {
  settings: SettingsService;
  approvals: ApprovalService;
  audit: AuditLogService;
  /** Always-allowed working directory (the app's own data folder). */
  workspaceDir: string;
}

export interface FileHit {
  path: string;
  size: number;
  modifiedAt: string;
}

/**
 * Local file access under least privilege (§12).
 *
 * Every path is resolved and then checked against the configured roots — a
 * relative path, a symlink target or a `..` segment that escapes the roots is
 * refused. Deleting and overwriting are gated actions: this class never
 * performs them without a claimed approval.
 */
export class FileAgent {
  readonly name = 'FileAgent';

  constructor(private readonly deps: FileAgentDeps) {}

  private roots(): string[] {
    const configured = this.deps.settings.get().integrations.fileRoots ?? [];
    return [this.deps.workspaceDir, ...configured].map((root) => resolve(root));
  }

  /** Resolves a user-supplied path and proves it stays inside an allowed root. */
  resolveInsideRoots(input: string): Result<string, JarvisError> {
    if (!input.trim()) return err(makeError('file.no_path', 'Es wurde kein Pfad angegeben.'));
    const roots = this.roots();
    const candidate = isAbsolute(input) ? resolve(input) : resolve(this.deps.workspaceDir, input);

    // realpath where possible, so a symlink cannot point out of the sandbox.
    let effective = candidate;
    try {
      effective = existsSync(candidate) ? resolve(realpathSync(candidate)) : candidate;
    } catch {
      effective = candidate;
    }

    const inside = roots.some((root) => {
      const rel = relative(root, effective);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    });
    if (!inside) {
      return err(
        makeError('file.outside_roots', `Der Pfad liegt außerhalb der freigegebenen Ordner.`, {
          hint: `Freigegeben sind: ${roots.join(', ')}. Weitere Ordner in den Einstellungen ergänzen.`,
        }),
      );
    }
    return ok(effective);
  }

  async search(pattern: string, limit = 40): Promise<Result<FileHit[], JarvisError>> {
    const needle = pattern.trim().toLowerCase();
    if (!needle) return err(makeError('file.no_pattern', 'Es wurde kein Suchbegriff angegeben.'));

    const hits: FileHit[] = [];
    for (const root of this.roots()) {
      await walk(root, 0, async (path, stats) => {
        if (hits.length >= limit) return false;
        if (path.toLowerCase().includes(needle)) {
          hits.push({
            path,
            size: stats.size,
            modifiedAt: new Date(stats.mtimeMs).toISOString(),
          });
        }
        return true;
      });
      if (hits.length >= limit) break;
    }
    return ok(hits);
  }

  async read(path: string, maxBytes = 200_000): Promise<Result<string, JarvisError>> {
    const resolved = this.resolveInsideRoots(path);
    if (!resolved.ok) return resolved;
    try {
      const stats = await fs.stat(resolved.value);
      if (!stats.isFile()) return err(makeError('file.not_a_file', `${path} ist keine Datei.`));
      if (stats.size > maxBytes) {
        return err(
          makeError(
            'file.too_large',
            `Die Datei ist ${(stats.size / 1024).toFixed(0)} kB groß; es werden höchstens ${(maxBytes / 1024).toFixed(0)} kB gelesen.`,
          ),
        );
      }
      const content = await fs.readFile(resolved.value, 'utf8');
      this.deps.audit.log({
        actor: 'jarvis',
        agent: this.name,
        action: 'datei.gelesen',
        subject: resolved.value,
        outcome: 'ok',
      });
      return ok(content);
    } catch (error) {
      return err(fsError(error, path));
    }
  }

  /** Creates a new file. Overwriting an existing one needs approval. */
  async create(path: string, content: string): Promise<Result<string, JarvisError>> {
    const resolved = this.resolveInsideRoots(path);
    if (!resolved.ok) return resolved;

    if (existsSync(resolved.value)) {
      const claim = this.deps.approvals.claim(
        `file.overwrite:${resolved.value}`,
        fingerprint(resolved.value, content.length),
      );
      if (!claim.ok) return claim;
    }

    try {
      await fs.mkdir(resolve(resolved.value, '..'), { recursive: true });
      await fs.writeFile(resolved.value, content, 'utf8');
      this.deps.audit.log({
        actor: 'jarvis',
        agent: this.name,
        action: 'datei.geschrieben',
        subject: resolved.value,
        outcome: 'ok',
        detail: `${content.length} Zeichen`,
      });
      return ok(resolved.value);
    } catch (error) {
      return err(fsError(error, path));
    }
  }

  /** Asks for approval to overwrite; does not write. */
  requestOverwrite(path: string, content: string): Result<{ approvalId: number }, JarvisError> {
    const resolved = this.resolveInsideRoots(path);
    if (!resolved.ok) return resolved;
    const request = this.deps.approvals.request({
      action: 'file.overwrite',
      title: `Datei überschreiben: ${resolved.value}`,
      subject: `file.overwrite:${resolved.value}`,
      fingerprint: fingerprint(resolved.value, content.length),
      facts: [
        { label: 'Aktion', value: 'Datei überschreiben' },
        { label: 'Pfad', value: resolved.value },
        { label: 'Neue Größe', value: `${content.length} Zeichen` },
      ],
      preview: content.slice(0, 2000),
    });
    return ok({ approvalId: request.id });
  }

  /** Asks for approval to delete; does not delete. */
  requestDelete(path: string): Result<{ approvalId: number }, JarvisError> {
    const resolved = this.resolveInsideRoots(path);
    if (!resolved.ok) return resolved;
    if (!existsSync(resolved.value)) {
      return err(makeError('file.not_found', `${path} existiert nicht.`));
    }
    const request = this.deps.approvals.request({
      action: 'file.delete',
      title: `Datei löschen: ${resolved.value}`,
      subject: `file.delete:${resolved.value}`,
      fingerprint: fingerprint(resolved.value),
      facts: [
        { label: 'Aktion', value: 'Datei löschen' },
        { label: 'Pfad', value: resolved.value },
      ],
    });
    return ok({ approvalId: request.id });
  }

  async deleteApproved(path: string): Promise<Result<true, JarvisError>> {
    const resolved = this.resolveInsideRoots(path);
    if (!resolved.ok) return resolved;
    const claim = this.deps.approvals.claim(`file.delete:${resolved.value}`, fingerprint(resolved.value));
    if (!claim.ok) return claim;
    try {
      await fs.rm(resolved.value, { recursive: false });
      this.deps.audit.log({
        actor: 'jarvis',
        agent: this.name,
        action: 'datei.geloescht',
        subject: resolved.value,
        outcome: 'ok',
      });
      return ok(true);
    } catch (error) {
      return err(fsError(error, path));
    }
  }
}

async function walk(
  root: string,
  depth: number,
  visit: (path: string, stats: { size: number; mtimeMs: number }) => Promise<boolean>,
): Promise<void> {
  if (depth > 4) return;
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await walk(path, depth + 1, visit);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stats = await fs.stat(path);
      const keepGoing = await visit(path, { size: stats.size, mtimeMs: stats.mtimeMs });
      if (!keepGoing) return;
    } catch {
      // Unreadable entry — skip.
    }
  }
}

function fsError(error: unknown, path: string): JarvisError {
  const code = (error as { code?: string }).code;
  switch (code) {
    case 'ENOENT':
      return makeError('file.not_found', `${path} existiert nicht.`);
    case 'EACCES':
    case 'EPERM':
      return makeError('file.forbidden', `Keine Berechtigung für ${path}.`);
    case 'EISDIR':
      return makeError('file.is_directory', `${path} ist ein Ordner.`);
    default:
      return makeError('file.error', `Dateizugriff auf ${path} fehlgeschlagen.`, {
        detail: error instanceof Error ? error.message : String(error),
      });
  }
}

/** Exported so callers can render the sandbox in the settings UI. */
export function describeRoots(roots: string[]): string {
  return roots.map((root) => root.endsWith(sep) ? root : root + sep).join(', ');
}
