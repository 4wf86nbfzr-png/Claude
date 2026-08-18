import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, seedCompany, ScriptedLlm, type TestHarness } from './helpers.js';
import type { LlmResponse } from '../src/core/llm/types.js';
import { buildToolRegistry } from '../src/core/tools/index.js';

const draftReply = (subject: string, body: string, rationale: string): LlmResponse => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({ subject, body, rationale }),
    },
  ],
  stopReason: 'end_turn',
});

describe('Akquise-Vorbereitung', () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.dispose();
    harness = null;
  });

  it('erstellt je Unternehmen einen eigenen Entwurf und versendet nichts', async () => {
    const llm = new ScriptedLlm([
      draftReply(
        'Baustellenbewachung für Ihre Projekte in Hamburg',
        'Moin, Sie realisieren Hochbauprojekte in Hamburg. Wir übernehmen die Bewachung. Viele Grüße',
        'Hochbau in Hamburg, laufende Baustellen wahrscheinlich.',
      ),
      draftReply(
        'Nachtbewachung für Ihre Elbufer-Baustellen',
        'Moin, Ihr Schwerpunkt liegt im Tiefbau am Elbufer. Wir sichern solche Flächen nachts ab. Viele Grüße',
        'Tiefbau an exponierter Lage.',
      ),
    ]);
    const env = createHarness({ llm });
    harness = env;

    const first = seedCompany(env.runtime, { name: 'Nordbau Hamburg GmbH', domain: 'nordbau.example' });
    const second = seedCompany(env.runtime, { name: 'Elbe Tiefbau GmbH', domain: 'elbe-tiefbau.example' });

    const campaign = env.runtime.repos.campaigns.create({
      name: 'Hamburger Bauunternehmen',
      service: '24/7 Baustellenbewachung und Alarmüberwachung',
      region: 'Hamburg + 50 km',
      targetCount: 50,
    });

    const result = await env.runtime.agents.outreach.prepareDrafts(campaign.id, [
      first.companyId,
      second.companyId,
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.drafted).toBe(2);
    expect(env.transport.sent).toHaveLength(0);

    const drafts = env.runtime.repos.emails.list({ campaignId: campaign.id, limit: 10 });
    expect(drafts).toHaveLength(2);
    // Keine identische Massenmail.
    expect(drafts[0]?.subject).not.toBe(drafts[1]?.subject);
    expect(drafts[0]?.body).not.toBe(drafts[1]?.body);
    expect(drafts.every((draft) => draft.status === 'entwurf')).toBe(true);

    // Der Akquisegrund ist als Einschätzung gekennzeichnet (§15).
    const company = env.runtime.repos.companies.get(first.companyId);
    expect(company?.outreachRationale).toContain('KI-EINSCHÄTZUNG');
  });

  it('überspringt Unternehmen ohne verifizierte Adresse mit klarer Begründung', async () => {
    const env = createHarness({ llm: new ScriptedLlm([draftReply('Betreff', 'Ein hinreichend langer Text.', 'Grund genug.')]) });
    harness = env;

    const { company } = env.runtime.repos.companies.upsert({
      name: 'Ohne Adresse GmbH',
      domain: 'ohne-adresse.example',
    });
    const campaign = env.runtime.repos.campaigns.create({ name: 'Test', service: 'Bewachung' });

    const result = await env.runtime.agents.outreach.prepareDrafts(campaign.id, [company.id]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.drafted).toBe(0);
    expect(result.value.skipped[0]?.reason).toBe('Keine verifizierte E-Mail-Adresse gefunden');
  });

  it('bereitet keinen zweiten Erstkontakt vor', async () => {
    const env = createHarness({
      llm: new ScriptedLlm([draftReply('Betreff', 'Ein hinreichend langer Text für den Entwurf.', 'Grund genug.')]),
    });
    harness = env;

    const seeded = seedCompany(env.runtime);
    const campaign = env.runtime.repos.campaigns.create({ name: 'Test', service: 'Bewachung' });

    const first = await env.runtime.agents.outreach.prepareDrafts(campaign.id, [seeded.companyId]);
    expect(first.ok && first.value.drafted).toBe(1);

    const second = await env.runtime.agents.outreach.prepareDrafts(campaign.id, [seeded.companyId]);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.drafted).toBe(0);
    expect(second.value.skipped[0]?.reason).toContain('bereits Entwurf');
  });

  it('meldet einen unbrauchbaren Modellauswurf als Fehler statt zu raten', async () => {
    const env = createHarness({
      llm: new ScriptedLlm([{ content: [{ type: 'text', text: 'Kein JSON hier.' }], stopReason: 'end_turn' }]),
    });
    harness = env;

    const seeded = seedCompany(env.runtime);
    const campaign = env.runtime.repos.campaigns.create({ name: 'Test', service: 'Bewachung' });

    const result = await env.runtime.agents.outreach.prepareDrafts(campaign.id, [seeded.companyId]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.drafted).toBe(0);
    expect(result.value.skipped[0]?.reason).toContain('keinen verwertbaren Entwurf');
  });
});

describe('Werkzeugverzeichnis', () => {
  const registry = buildToolRegistry();

  it('meldet jedes Werkzeug mit gültigem JSON-Schema an das Modell', () => {
    const described = registry.describe();
    expect(described.length).toBe(registry.names().length);
    for (const tool of described) {
      expect(tool.name, tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(tool.inputSchema.type, tool.name).toBe('object');
    }
  });

  it('enthält die in der Spezifikation genannten Werkzeuge', () => {
    for (const name of [
      'search_web',
      'open_website',
      'extract_company_information',
      'verify_email',
      'create_email_draft',
      'read_email_draft',
      'send_email',
      'open_application',
      'open_file',
      'create_file',
      'search_files',
      'check_calendar',
    ]) {
      expect(registry.has(name), name).toBe(true);
    }
  });

  it('lehnt unbekannte Werkzeuge und ungültige Parameter ab', async () => {
    const context = {} as never;
    const unknown = await registry.execute('gibt_es_nicht', {}, context);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe('tool.unknown');

    const invalid = await registry.execute('read_email_draft', { emailId: 'keine Zahl' }, context);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe('tool.invalid_input');
  });

  it('kennzeichnet freigabepflichtige Werkzeuge', () => {
    expect(registry.get('send_email')?.approvalAction).toBe('email.send');
    expect(registry.get('delete_file')?.approvalAction).toBe('file.delete');
    expect(registry.get('search_web')?.approvalAction).toBeUndefined();
  });
});
