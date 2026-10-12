"""Globale Systemeinstellungen: Not-Aus-Schalter, Budgets, Autonomie-Flags."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.models.core import SystemSetting

KEY_KILL_SWITCH = "kill_switch"
KEY_AI_BUDGET = "ai_budget"
KEY_AUTONOMY = "autonomy"

DEFAULTS: dict[str, dict] = {
    KEY_KILL_SWITCH: {"active": False, "reason": None, "activated_at": None},
    KEY_AI_BUDGET: {"global_daily_cents": None},  # None = Wert aus Settings
    KEY_AUTONOMY: {
        "agents_enabled": True,
        "auto_publish_content": False,  # Inhalte nur nach Prüfung + Freigabe
        "auto_reply_enabled_default": False,
    },
}


async def get_setting(db: AsyncSession, key: str) -> dict:
    row = await db.get(SystemSetting, key)
    if row is None:
        return dict(DEFAULTS.get(key, {}))
    merged = dict(DEFAULTS.get(key, {}))
    merged.update(row.value or {})
    return merged


async def set_setting(db: AsyncSession, key: str, value: dict, updated_by: str | None) -> dict:
    row = await db.get(SystemSetting, key)
    if row is None:
        row = SystemSetting(key=key, value=value, updated_at=utcnow(), updated_by=updated_by)
        db.add(row)
    else:
        merged = dict(row.value or {})
        merged.update(value)
        row.value = merged
        row.updated_at = utcnow()
        row.updated_by = updated_by
    await db.flush()
    return await get_setting(db, key)


async def kill_switch_active(db: AsyncSession) -> bool:
    return bool((await get_setting(db, KEY_KILL_SWITCH)).get("active"))


async def activate_kill_switch(db: AsyncSession, reason: str, by: str) -> dict:
    return await set_setting(
        db, KEY_KILL_SWITCH, {"active": True, "reason": reason, "activated_at": utcnow().isoformat()}, by
    )


async def deactivate_kill_switch(db: AsyncSession, by: str) -> dict:
    return await set_setting(db, KEY_KILL_SWITCH, {"active": False, "reason": None, "activated_at": None}, by)


async def all_settings(db: AsyncSession) -> dict[str, dict]:
    rows = (await db.execute(select(SystemSetting))).scalars().all()
    out = {k: dict(v) for k, v in DEFAULTS.items()}
    for r in rows:
        out.setdefault(r.key, {}).update(r.value or {})
    return out
