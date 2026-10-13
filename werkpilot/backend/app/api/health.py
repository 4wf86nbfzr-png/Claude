from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.system import kill_switch_active

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    db_ok = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "db": db_ok, "kill_switch": await kill_switch_active(db) if db_ok else None, "env": get_settings().env}


@router.get("/api/public/config")
async def public_config():
    s = get_settings()
    from app.services.billing import stripe_configured
    from app.services.email import email_is_live
    from app.services.llm import llm_is_live

    return {
        "app": s.app_name,
        "env": s.env,
        "stripe_ready": stripe_configured(),
        "llm_live": llm_is_live(),
        "email_live": email_is_live(),
        "trial_days": s.trial_days,
        "downloads": {"windows": s.download_windows_url, "macos": s.download_macos_url, "ios": s.download_ios_url, "android": s.download_android_url},
    }
