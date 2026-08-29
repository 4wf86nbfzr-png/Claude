import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventDedupKey } from '@jarvis/domain';
import { FakeClock, SeqIdGenerator, emailEventFixture, whatsappEventFixture } from '@jarvis/testkit';
import { EventStore } from './event-store.js';
import { JobQueue, backoffSeconds } from './job-queue.js';
import { migrate, MIGRATIONS, schemaVersion } from './schema.js';
import { openMemoryDatabase, type Db } from './db.js';

let db: Db;
let clock: FakeClock;
let ids: SeqIdGenerator;

beforeEach(() => {
  db = openMemoryDatabase();
  migrate(db);
  clock = new FakeClock();
  ids = new SeqIdGenerator();
});

afterEach(() => {
  db.close();
});

describe('Migrationen', () => {
  it('laufen genau einmal', () => {
    // Nicht auf eine feste Zahl festnageln: sonst schlaegt dieser Test bei
    // jeder neuen Migration fehl, ohne dass etwas kaputt waere.
    const letzte = MIGRATIONS.at(-1)?.id ?? 0;
    expect(schemaVersion(db)).toBe(letzte);
    expect(migrate(db)).toBe(0);
    expect(schemaVersion(db)).toBe(letzte);
  });

  it('vergibt aufsteigende, luecken- und dublettenfreie Nummern', () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Eventstore - Deduplizierung', () => {
  it('nimmt dieselbe Nachricht nur einmal auf', () => {
    const store = new EventStore(db, clock, ids);
    const draft = emailEventFixture();

    const first = store.ingest(draft);
    const second = store.ingest(draft);

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.event.id).toBe(first.event.id);
    expect(store.countOpen()).toBe(1);
  });

  it('unterscheidet Nachrichten mit gleicher ID auf verschiedenen Kanaelen', () => {
    const store = new EventStore(db, clock, ids);
    store.ingest(emailEventFixture({ providerId: 'gleich' }));
    store.ingest(whatsappEventFixture({ providerId: 'gleich' }));
    expect(store.countOpen()).toBe(2);
  });

  it('der Dedup-Schluessel haengt an Kanal, Konto und Provider-ID', () => {
    const a = eventDedupKey({ channel: 'email', providerAccount: 'x', providerId: '1' });
    const b = eventDedupKey({ channel: 'email', providerAccount: 'x', providerId: '2' });
    const c = eventDedupKey({ channel: 'email', providerAccount: 'y', providerId: '1' });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('zaehlt selbst erzeugte Ereignisse nicht als offen', () => {
    const store = new EventStore(db, clock, ids);
    store.ingest(emailEventFixture({ selfOriginated: true }));
    expect(store.countOpen()).toBe(0);
  });

  it('ueberlebt einen Neustart des Prozesses', () => {
    const store = new EventStore(db, clock, ids);
    const { event } = store.ingest(emailEventFixture());

    // Neuer Store auf derselben Datenbank - wie nach einem Neustart.
    const afterRestart = new EventStore(db, clock, new SeqIdGenerator());
    expect(afterRestart.byId(event.id)?.id).toBe(event.id);
    expect(afterRestart.countOpen()).toBe(1);

    // Und die Deduplizierung greift weiterhin.
    expect(afterRestart.ingest(emailEventFixture()).isNew).toBe(false);
  });

  it('liefert die Thread-Historie in zeitlicher Reihenfolge', () => {
    const store = new EventStore(db, clock, ids);
    store.ingest(emailEventFixture({ providerId: 'a', receivedAt: '2026-03-02T08:00:00.000Z' }));
    store.ingest(emailEventFixture({ providerId: 'b', receivedAt: '2026-03-02T09:00:00.000Z' }));

    const history = store.threadHistory('email', 'thread-1');
    expect(history).toHaveLength(2);
    expect(history[0]?.receivedAt).toBe('2026-03-02T08:00:00.000Z');
  });
});

describe('Jobqueue', () => {
  it('legt denselben Job nicht zweimal an', () => {
    const q = new JobQueue(db, clock, ids);
    const a = q.enqueue({ kind: 'call', deduplicationKey: 'call:evt_1', payload: { x: 1 } });
    const b = q.enqueue({ kind: 'call', deduplicationKey: 'call:evt_1', payload: { x: 2 } });

    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(false);
    expect(b.job.id).toBe(a.job.id);
    expect(q.countByState('call', 'PENDING')).toBe(1);
  });

  it('gibt einen Job nur einmal gleichzeitig heraus', () => {
    const q = new JobQueue(db, clock, ids);
    q.enqueue({ kind: 'call', deduplicationKey: 'k', payload: {} });

    expect(q.claim('call')).not.toBeNull();
    expect(q.claim('call')).toBeNull();
  });

  it('gibt einen Job nach Ablauf der Sperre wieder frei', () => {
    const q = new JobQueue(db, clock, ids);
    q.enqueue({ kind: 'call', deduplicationKey: 'k', payload: {} });
    q.claim('call', 60);

    clock.advanceSeconds(61);
    expect(q.claim('call')).not.toBeNull();
  });

  it('stellt nach einem Neustart haengende Jobs wieder her', () => {
    const q = new JobQueue(db, clock, ids);
    q.enqueue({ kind: 'call', deduplicationKey: 'k', payload: {} });
    q.claim('call', 300);

    // Simulierter Absturz: der Prozess startet neu, die Sperre laeuft noch.
    clock.advanceSeconds(301);
    const afterRestart = new JobQueue(db, clock, new SeqIdGenerator());
    expect(afterRestart.recoverStale()).toBe(1);
    expect(afterRestart.countByState('call', 'PENDING')).toBe(1);
  });

  it('verschiebt Fehlversuche mit wachsendem Abstand', () => {
    const q = new JobQueue(db, clock, ids);
    const { job } = q.enqueue({ kind: 'call', deduplicationKey: 'k', payload: {}, maxAttempts: 5 });

    const first = q.fail(job.id, 'Fehler 1', () => 0.5);
    expect(first?.state).toBe('PENDING');
    expect(first?.attempts).toBe(1);
    const firstDelay = Date.parse(first?.nextAttemptAt ?? '') - clock.now().getTime();

    const second = q.fail(job.id, 'Fehler 2', () => 0.5);
    const secondDelay = Date.parse(second?.nextAttemptAt ?? '') - clock.now().getTime();
    expect(secondDelay).toBeGreaterThan(firstDelay);
  });

  it('landet nach maxAttempts im Dead-Letter-Status statt verloren zu gehen', () => {
    const q = new JobQueue(db, clock, ids);
    const { job } = q.enqueue({ kind: 'call', deduplicationKey: 'k', payload: {}, maxAttempts: 2 });

    q.fail(job.id, 'Fehler 1');
    const dead = q.fail(job.id, 'Fehler 2');

    expect(dead?.state).toBe('DEAD_LETTER');
    expect(q.byId(job.id)).not.toBeNull();
    expect(q.countByState('call', 'DEAD_LETTER')).toBe(1);
  });

  it('pausiert und setzt eine Jobart fort, ohne etwas zu loeschen', () => {
    const q = new JobQueue(db, clock, ids);
    q.enqueue({ kind: 'call', deduplicationKey: 'a', payload: {} });
    q.enqueue({ kind: 'call', deduplicationKey: 'b', payload: {} });

    expect(q.pauseKind('call', 'limit')).toBe(2);
    expect(q.claim('call')).toBeNull();
    expect(q.countByState('call', 'PAUSED')).toBe(2);

    expect(q.resumeKind('call')).toBe(2);
    expect(q.claim('call')).not.toBeNull();
  });

  it('haelt eine Verschiebung ohne Fehlversuch auseinander', () => {
    const q = new JobQueue(db, clock, ids);
    const { job } = q.enqueue({ kind: 'call', deduplicationKey: 'k', payload: {} });
    q.claim('call');

    q.reschedule(job.id, new Date(clock.now().getTime() + 120_000), 'Leitung belegt');
    const after = q.byId(job.id);
    expect(after?.attempts).toBe(0);
    expect(after?.state).toBe('PENDING');
    expect(q.claim('call')).toBeNull();

    clock.advanceSeconds(121);
    expect(q.claim('call')).not.toBeNull();
  });

  it('Backoff waechst, bleibt aber gedeckelt', () => {
    const rnd = (): number => 0.5;
    expect(backoffSeconds(1, undefined, rnd)).toBeLessThan(backoffSeconds(3, undefined, rnd));
    expect(backoffSeconds(50, undefined, rnd)).toBeLessThanOrEqual(15 * 60 * 1.2);
  });
});

describe('Transaktionen', () => {
  it('macht bei einem Fehler alles rueckgaengig', () => {
    const store = new EventStore(db, clock, ids);
    store.ingest(emailEventFixture());

    expect(() =>
      db.transaction(() => {
        db.run('DELETE FROM events');
        throw new Error('Abbruch');
      }),
    ).toThrow('Abbruch');

    expect(store.countOpen()).toBe(1);
  });

  it('vertraegt Verschachtelung', () => {
    const result = db.transaction(() => {
      db.run("INSERT INTO sync_state (connector, updated_at) VALUES ('a', '2026-01-01T00:00:00Z')");
      return db.transaction(() => {
        db.run("INSERT INTO sync_state (connector, updated_at) VALUES ('b', '2026-01-01T00:00:00Z')");
        return 'fertig';
      });
    });
    expect(result).toBe('fertig');
    expect(db.all('SELECT * FROM sync_state')).toHaveLength(2);
  });

  it('rollt eine innere Transaktion zurueck, ohne die aeussere zu zerstoeren', () => {
    db.transaction(() => {
      db.run("INSERT INTO sync_state (connector, updated_at) VALUES ('aussen', '2026-01-01T00:00:00Z')");
      try {
        db.transaction(() => {
          db.run("INSERT INTO sync_state (connector, updated_at) VALUES ('innen', '2026-01-01T00:00:00Z')");
          throw new Error('innerer Abbruch');
        });
      } catch {
        /* erwartet */
      }
    });

    const rows = db.all<{ connector: string }>('SELECT connector FROM sync_state');
    expect(rows.map((r) => r.connector)).toEqual(['aussen']);
  });
});
