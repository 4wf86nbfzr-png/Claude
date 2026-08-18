import { describe, expect, it } from 'vitest';
import { Db } from '../src/core/db/database';
import { createRepositories } from '../src/core/db/repositories';
import { ApprovalService, requiresApproval } from '../src/core/services/approval';
import { AuditLogService } from '../src/core/services/audit';
import { EventBus } from '../src/core/services/events';
import { interpretApprovalUtterance } from '../src/core/services/approvalPhrases';
import { ApprovalStatus } from '../src/shared/status';

function aufbau() {
  const repos = createRepositories(Db.open(':memory:'));
  const bus = new EventBus();
  const audit = new AuditLogService(repos.audit, bus);
  const service = new ApprovalService(repos.approvals, audit, bus, 30);
  return { repos, service, bus, audit };
}

describe('Freigabestelle', () => {
  it('kennt die kritischen Aktionen aus §11', () => {
    expect(requiresApproval('send_email')).toBe(true);
    expect(requiresApproval('delete_file')).toBe(true);
    expect(requiresApproval('search_web')).toBe(false);
  });

  it('verweigert das Einlösen, solange nicht freigegeben wurde', () => {
    const { service } = aufbau();
    const approval = service.request({
      action: 'send_email',
      title: 'Mail an kontakt@firma.de',
      summary: 'Test',
      payload: {},
      contentHash: 'abc'
    });
    const ergebnis = service.consume(approval.id, { action: 'send_email', contentHash: 'abc' });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok === false && ergebnis.status).toBe(ApprovalStatus.OFFEN);
  });

  it('löst eine erteilte Freigabe genau einmal ein', () => {
    const { service } = aufbau();
    const approval = service.request({
      action: 'send_email',
      title: 'Mail',
      summary: '',
      payload: {},
      contentHash: 'abc'
    });
    service.decide(approval.id, true);
    expect(service.consume(approval.id, { action: 'send_email', contentHash: 'abc' }).ok).toBe(true);
    const zweiter = service.consume(approval.id, { action: 'send_email', contentHash: 'abc' });
    expect(zweiter.ok).toBe(false);
    expect(zweiter.ok === false && zweiter.status).toBe(ApprovalStatus.VERBRAUCHT);
  });

  it('verweigert das Einlösen bei geändertem Inhalt', () => {
    const { service } = aufbau();
    const approval = service.request({
      action: 'send_email',
      title: 'Mail',
      summary: '',
      payload: {},
      contentHash: 'urspruenglich'
    });
    service.decide(approval.id, true);
    const ergebnis = service.consume(approval.id, { action: 'send_email', contentHash: 'geaendert' });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok === false && ergebnis.reason).toMatch(/geändert/);
  });

  it('verweigert das Einlösen für eine andere Aktion', () => {
    const { service } = aufbau();
    const approval = service.request({
      action: 'delete_file',
      title: 'Datei löschen',
      summary: '',
      payload: {},
      contentHash: 'abc'
    });
    service.decide(approval.id, true);
    expect(service.consume(approval.id, { action: 'send_email', contentHash: 'abc' }).ok).toBe(false);
  });

  it('lässt abgelaufene Freigaben verfallen', () => {
    const { service } = aufbau();
    const approval = service.request({
      action: 'send_email',
      title: 'Mail',
      summary: '',
      payload: {},
      contentHash: 'abc',
      ttlMinutes: -1
    });
    service.decide(approval.id, true);
    const ergebnis = service.consume(approval.id, { action: 'send_email', contentHash: 'abc' });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok === false && ergebnis.status).toBe(ApprovalStatus.ABGELAUFEN);
  });

  it('protokolliert Anfrage und Entscheidung', () => {
    const { service, audit } = aufbau();
    const approval = service.request({
      action: 'send_email',
      title: 'Mail an kontakt@firma.de',
      summary: '',
      payload: {},
      contentHash: 'abc'
    });
    service.decide(approval.id, false, 'Doch nicht');
    const aktionen = audit.recent().map((e) => e.action);
    expect(aktionen).toContain('Freigabe angefragt');
    expect(aktionen).toContain('Freigabe verweigert');
  });
});

describe('Deutung gesprochener Freigaben', () => {
  const frage = { frageGestellt: true };

  it('erkennt eindeutige Sendeaufforderungen', () => {
    for (const satz of ['Senden.', 'Freigeben', 'Mail abschicken', 'Ja, genau so senden', 'Schick sie ab']) {
      expect(interpretApprovalUtterance(satz)).toBe('FREIGEBEN');
    }
  });

  it('nimmt ein kurzes Ja nur als Antwort auf die Freigabefrage', () => {
    expect(interpretApprovalUtterance('Ja', frage)).toBe('FREIGEBEN');
    expect(interpretApprovalUtterance('Ja')).toBe('UNKLAR');
  });

  it('erkennt Absagen', () => {
    for (const satz of ['Abbrechen', 'Nein', 'Bitte nicht senden', 'Warte kurz', 'Lieber nicht']) {
      expect(interpretApprovalUtterance(satz, frage)).toBe('ABLEHNEN');
    }
  });

  it('bleibt bei Vorbehalten unklar', () => {
    for (const satz of [
      'Ja, aber mach den zweiten Absatz kürzer',
      'Vielleicht senden',
      'Ich glaube, das passt',
      'Ja, vorher noch kurz ändern'
    ]) {
      expect(interpretApprovalUtterance(satz, frage)).toBe('UNKLAR');
    }
  });
});
