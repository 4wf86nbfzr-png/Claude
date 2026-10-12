"""Backup & Wiederherstellung mit den echten Skripten gegen Postgres (übersprungen, wenn pg_dump fehlt)."""

import os
import shutil
import subprocess
import tempfile

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from tests.conftest import register_and_login

pytestmark = pytest.mark.skipif(not shutil.which("pg_dump") or not get_settings().database_url.startswith("postgresql"), reason="pg_dump/Postgres nicht verfügbar")

SCRIPTS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "scripts")


async def test_backup_and_restore_roundtrip(client, db):
    h, tid = await register_and_login(client, company="Restore GmbH")
    await client.post("/api/inquiries", headers=h, json={"body": "Backup-Testanfrage, Musterstr 1 20095 Hamburg 040123", "sender_email": "b@x.test"})
    url = get_settings().database_url
    tmp = tempfile.mkdtemp()
    out = subprocess.run([f"{SCRIPTS}/backup.sh", tmp], env={**os.environ, "DATABASE_URL": url}, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    backup_file = out.stdout.strip()
    assert os.path.getsize(backup_file) > 1000
    # In eine frische DB wiederherstellen
    plain = url.replace("postgresql+asyncpg:", "postgresql:")
    base, _, _ = plain.rpartition("/")
    restore_db = "werkpilot_restore_test"
    admin = base + "/postgres"
    subprocess.run(["psql", "-q", admin, "-c", f"DROP DATABASE IF EXISTS {restore_db}"], check=True, capture_output=True)
    subprocess.run(["psql", "-q", admin, "-c", f"CREATE DATABASE {restore_db}"], check=True, capture_output=True)
    out = subprocess.run([f"{SCRIPTS}/restore.sh", backup_file, f"{base}/{restore_db}"], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    res = subprocess.run(["psql", "-tA", f"{base}/{restore_db}", "-c", "SELECT count(*) FROM inquiries; SELECT name FROM tenants;"], capture_output=True, text=True)
    assert res.stdout.split() == ["1", "Restore", "GmbH"] or res.stdout.strip().splitlines() == ["1", "Restore GmbH"]
    subprocess.run(["psql", "-q", admin, "-c", f"DROP DATABASE {restore_db}"], check=True, capture_output=True)
    shutil.rmtree(tmp)
    from app.models.core import Tenant

    assert (await db.execute(select(Tenant).where(Tenant.id == tid))).scalar_one()
