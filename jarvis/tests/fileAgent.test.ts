import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHarness, type TestHarness } from './helpers.js';

describe('Dateizugriff', () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    harness.dispose();
  });

  it('schreibt und liest im Arbeitsordner', async () => {
    const written = await harness.runtime.agents.file.create('notiz.txt', 'Moin');
    expect(written.ok).toBe(true);

    const read = await harness.runtime.agents.file.read('notiz.txt');
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toBe('Moin');
  });

  it('verweigert Pfade außerhalb der freigegebenen Ordner', () => {
    for (const path of ['/etc/passwd', '../../../etc/passwd', '/tmp/fremd.txt']) {
      const resolved = harness.runtime.agents.file.resolveInsideRoots(path);
      expect(resolved.ok, path).toBe(false);
      if (!resolved.ok) expect(resolved.error.code).toBe('file.outside_roots');
    }
  });

  it('erlaubt zusätzliche Ordner nur nach ausdrücklicher Konfiguration', () => {
    const before = harness.runtime.agents.file.resolveInsideRoots(join(harness.runtime.dataDir, 'extra'));
    expect(before.ok).toBe(false);

    harness.runtime.services.settings.update({
      integrations: {
        ...harness.runtime.services.settings.get().integrations,
        fileRoots: [harness.runtime.dataDir],
      },
    });

    const after = harness.runtime.agents.file.resolveInsideRoots(join(harness.runtime.dataDir, 'extra'));
    expect(after.ok).toBe(true);
  });

  it('überschreibt eine bestehende Datei nur mit Freigabe', async () => {
    const target = join(harness.runtime.workspaceDir, 'bestand.txt');
    writeFileSync(target, 'alt');

    const blocked = await harness.runtime.agents.file.create('bestand.txt', 'neu');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('approval.missing');

    const request = harness.runtime.agents.file.requestOverwrite('bestand.txt', 'neu');
    if (!request.ok) throw new Error(request.error.message);
    harness.runtime.services.approvals.decide(request.value.approvalId, true, 'Test');

    const allowed = await harness.runtime.agents.file.create('bestand.txt', 'neu');
    expect(allowed.ok).toBe(true);

    const read = await harness.runtime.agents.file.read('bestand.txt');
    if (read.ok) expect(read.value).toBe('neu');
  });

  it('löscht nur mit Freigabe', async () => {
    const target = join(harness.runtime.workspaceDir, 'weg.txt');
    writeFileSync(target, 'inhalt');

    const blocked = await harness.runtime.agents.file.deleteApproved('weg.txt');
    expect(blocked.ok).toBe(false);
    expect(existsSync(target)).toBe(true);

    const request = harness.runtime.agents.file.requestDelete('weg.txt');
    if (!request.ok) throw new Error(request.error.message);
    harness.runtime.services.approvals.decide(request.value.approvalId, true, 'Test');

    const deleted = await harness.runtime.agents.file.deleteApproved('weg.txt');
    expect(deleted.ok).toBe(true);
    expect(existsSync(target)).toBe(false);
  });

  it('findet Dateien anhand des Namens', async () => {
    await harness.runtime.agents.file.create('angebot-hamburg.txt', 'x');
    const hits = await harness.runtime.agents.file.search('angebot');
    expect(hits.ok).toBe(true);
    if (hits.ok) expect(hits.value.some((hit) => hit.path.endsWith('angebot-hamburg.txt'))).toBe(true);
  });
});
