/**
 * `pnpm status` - was macht Jarvis gerade?
 *
 * Liest nur. Gibt maskierte Werte aus, keine Nachrichteninhalte und keine
 * Geheimnisse. Der Bericht laesst sich gefahrlos weitergeben.
 */
import { existsSync } from 'node:fs';
import { verifyChain, type AuditEntry } from '@jarvis/security';
import { migrate, openDatabase, schemaVersion } from '@jarvis/storage';
import { describeConfig, loadConfig } from '../apps/orchestrator/src/config.js';

interface Row {
  [key: string]: unknown;
}

function main(): void {
  const config = loadConfig();
  console.log('\nJarvis Pro - Status\n' + '='.repeat(60));

  const cfg = describeConfig(config);
  for (const [k, v] of Object.entries(cfg)) {
    console.log(`${k.padEnd(26)} ${String(v)}`);
  }

  if (!existsSync(config.db.path)) {
    console.log('\nEs gibt noch keine Datenbank. Jarvis lief hier noch nie.');
    return;
  }

  const db = openDatabase({ path: config.db.path });
  migrate(db);

  const count = (sql: string, params: string[] = []): number =>
    db.get<{ n: number }>(sql, params)?.n ?? 0;

  console.log('\nDatenbank\n' + '-'.repeat(60));
  console.log(`Schema-Version             ${schemaVersion(db)}`);
  console.log(`Ereignisse gesamt          ${count('SELECT COUNT(*) AS n FROM events')}`);
  console.log(
    `davon unbesprochen         ${count('SELECT COUNT(*) AS n FROM events WHERE handled = 0 AND self_originated = 0')}`,
  );
  console.log(`Anrufe gesamt              ${count('SELECT COUNT(*) AS n FROM calls')}`);
  console.log(`Aufgaben offen             ${count("SELECT COUNT(*) AS n FROM tasks WHERE state IN ('open','in_progress','waiting')")}`);
  console.log(`Erinnerungen               ${count('SELECT COUNT(*) AS n FROM memories')}`);

  console.log('\nAnruf-Jobs\n' + '-'.repeat(60));
  for (const state of ['PENDING', 'RUNNING', 'PAUSED', 'DONE', 'DEAD_LETTER']) {
    console.log(
      `${state.padEnd(26)} ${count("SELECT COUNT(*) AS n FROM jobs WHERE kind = 'call' AND state = ?", [state])}`,
    );
  }
  const dead = db.all<Row>("SELECT id, last_error FROM jobs WHERE state = 'DEAD_LETTER' LIMIT 5");
  if (dead.length > 0) {
    console.log('\nSteckengebliebene Jobs (nichts davon ist verloren):');
    for (const j of dead) console.log(`  ${String(j['id'])}: ${String(j['last_error']).slice(0, 90)}`);
  }

  console.log('\nFreigaben\n' + '-'.repeat(60));
  for (const state of ['DRAFT', 'READ_BACK', 'AWAITING_APPROVAL', 'APPROVED', 'SENT', 'CANCELLED', 'EXPIRED', 'FAILED', 'UNKNOWN']) {
    const n = count('SELECT COUNT(*) AS n FROM approvals WHERE state = ?', [state]);
    if (n > 0) console.log(`${state.padEnd(26)} ${n}`);
  }
  console.log(`Tatsaechlich gesendet      ${count("SELECT COUNT(*) AS n FROM sends WHERE state = 'SUCCEEDED'")}`);
  const unklar = count("SELECT COUNT(*) AS n FROM sends WHERE state = 'UNKNOWN'");
  if (unklar > 0) {
    console.log(`Status unklar              ${unklar}  <- im Postfach nachsehen`);
  }

  console.log('\nAudit-Log\n' + '-'.repeat(60));
  const rows = db.all<{
    seq: number; at: string; action: string; subject: string; details: string; prev_hash: string; hash: string;
  }>('SELECT * FROM audit_log ORDER BY seq ASC');
  const entries: AuditEntry[] = rows.map((r) => ({
    seq: r.seq,
    at: r.at,
    action: r.action as AuditEntry['action'],
    subject: r.subject,
    details: JSON.parse(r.details) as Record<string, unknown>,
    prevHash: r.prev_hash,
    hash: r.hash,
  }));
  const chain = verifyChain(entries);
  console.log(`Eintraege                  ${entries.length}`);
  console.log(`Kette                      ${chain.ok ? 'lueckenlos' : `GEBROCHEN bei ${chain.brokenAtSeq}: ${chain.reason}`}`);
  if (entries.length > 0) {
    console.log('\nLetzte Eintraege:');
    for (const e of entries.slice(-8)) {
      console.log(`  ${e.at}  ${e.action.padEnd(22)} ${e.subject}`);
    }
  }

  db.close();
  console.log('');
}

main();
