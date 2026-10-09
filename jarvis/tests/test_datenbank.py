"""Datenbank, Migrationen, Sicherung."""

from jarvis.db.database import Database
from jarvis.db.migrations import MIGRATIONS, current_version, migrate


def test_migration_ist_wiederholbar(settings):
    db = Database(settings.db_path)
    assert current_version(db) == 0
    applied = migrate(db, settings.backup_dir)
    assert applied == [number for number, _, _ in MIGRATIONS]
    assert current_version(db) == MIGRATIONS[-1][0]
    assert migrate(db, settings.backup_dir) == []
    db.close()


def test_sicherung_und_wiederherstellung(settings):
    db = Database(settings.db_path)
    migrate(db)
    db.insert("memory", {
        "key": "Lieblingscafe", "value": "Elbgold", "kind": "vorliebe", "importance": 4,
        "source": "test", "created_at": "2026-10-09T10:00:00Z",
        "updated_at": "2026-10-09T10:00:00Z",
    })
    backup = db.backup(settings.backup_dir, keep=3)
    assert backup.exists()

    db.execute("DELETE FROM memory")
    assert db.scalar("SELECT COUNT(*) FROM memory") == 0

    db.restore(backup)
    assert db.scalar("SELECT COUNT(*) FROM memory") == 1
    assert db.scalar("SELECT value FROM memory WHERE key = 'Lieblingscafe'") == "Elbgold"
    db.close()


def test_sicherungen_werden_begrenzt(settings):
    db = Database(settings.db_path)
    migrate(db)
    for _ in range(5):
        db.backup(settings.backup_dir, keep=2)
    assert len(list(settings.backup_dir.glob("jarvis-*.sqlite3"))) <= 2
    db.close()


def test_transaktion_rollt_zurueck(database):
    try:
        with database.transaction():
            database.insert("task", {
                "title": "halb", "created_at": "2026-10-09T10:00:00Z",
                "updated_at": "2026-10-09T10:00:00Z",
            })
            raise RuntimeError("Abbruch")
    except RuntimeError:
        pass
    assert database.scalar("SELECT COUNT(*) FROM task") == 0
