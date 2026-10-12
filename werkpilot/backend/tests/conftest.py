"""Testgerüst: eigene Test-DB (Postgres, Fallback SQLite), Mock-KI, Konsolen-E-Mail, saubere Tabellen je Test."""

from __future__ import annotations

import os

os.environ.setdefault("ENV", "test")
os.environ.setdefault("DATABASE_URL", os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://werkpilot:werkpilot@localhost:5432/werkpilot_test"))
os.environ["LLM_PROVIDER"] = "mock"
os.environ["EMAIL_PROVIDER"] = "console"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-123456"
os.environ["STRIPE_SECRET_KEY"] = "sk_test_dummy"
os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_testsecret"
os.environ["INBOUND_EMAIL_WEBHOOK_SECRET"] = "inbound-secret"
os.environ["RATE_LIMIT_PER_MINUTE"] = "1000"
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "50"
os.environ["OPS_ALERT_EMAIL"] = "ops@example.test"

import email_validator  # noqa: E402

# .test-Domains sind reserviert (RFC 2606) – genau deshalb nutzen wir sie in Tests.
email_validator.SPECIAL_USE_DOMAIN_NAMES = [d for d in email_validator.SPECIAL_USE_DOMAIN_NAMES if d != "test"]

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.db import Base, get_engine, get_sessionmaker  # noqa: E402
from app.core.ratelimit import reset_local_limits  # noqa: E402
from app.main import app  # noqa: E402
from app.services.email import ConsoleProvider  # noqa: E402
from app.services.features import ensure_default_plans  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
async def _schema():
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean():
    engine = get_engine()
    async with engine.begin() as conn:
        if get_settings().database_url.startswith("postgresql"):
            tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
            await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        else:
            for t in reversed(Base.metadata.sorted_tables):
                await conn.execute(t.delete())
    async with get_sessionmaker()() as db:
        await ensure_default_plans(db)
        from app.main import seed_knowledge

        await seed_knowledge(db)
        await db.commit()
    ConsoleProvider.sent.clear()
    reset_local_limits()
    yield


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def db():
    async with get_sessionmaker()() as session:
        yield session


def last_mail_link(prefix: str) -> str:
    import re

    for m in reversed(ConsoleProvider.sent):
        found = re.search(prefix + r"\?token=([A-Za-z0-9_\-]+)", m["text"])
        if found:
            return found.group(1)
    raise AssertionError(f"Kein Link mit {prefix} in gesendeten Mails")


async def register_and_login(client: AsyncClient, email="chef@beispiel-elektro.test", company="Beispiel Elektro", trade="elektro", password="Moin-Hafen-2026!"):
    r = await client.post("/api/auth/register", json={"email": email, "password": password, "full_name": "Kai Beispiel", "company": company, "trade": trade, "accept_terms": True, "accept_privacy": True})
    assert r.status_code == 201, r.text
    token = last_mail_link("/bestaetigen")
    r = await client.post("/api/auth/verify-email", json={"token": token})
    assert r.status_code == 200, r.text
    r = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data["tenant_id"]


async def make_operator(db, email: str) -> None:
    from sqlalchemy import select

    from app.models.core import User

    u = (await db.execute(select(User).where(User.email == email))).scalar_one()
    u.is_operator = True
    await db.commit()


async def activate_plan(db, tenant_id: str, code: str = "business") -> None:
    """Simuliert ein aktives Abo direkt in der DB (für Feature-Tests ohne Stripe)."""
    from datetime import timedelta

    from sqlalchemy import select

    from app.core.db import utcnow
    from app.models.billing import Plan, Subscription

    plan = (await db.execute(select(Plan).where(Plan.code == code))).scalar_one()
    sub = (await db.execute(select(Subscription).where(Subscription.tenant_id == tenant_id))).scalar_one()
    sub.plan_id = plan.id
    sub.status = "active"
    sub.current_period_end = utcnow() + timedelta(days=30)
    await db.commit()
