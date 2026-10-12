from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.ratelimit import auth_rate_limit, client_ip
from app.core.security import create_access_token
from app.models.core import Membership, Tenant, User
from app.services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

TRADES = ["elektro", "shk", "maler", "dach", "reinigung", "galabau", "bau", "sonstiges"]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=2, max_length=200)
    trade: str = "sonstiges"
    accept_terms: bool
    accept_privacy: bool


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_id: str | None
    user: dict


def _set_cookies(resp: Response, access: str, refresh: str | None) -> None:
    s = get_settings()
    common = {"httponly": True, "secure": s.cookie_secure, "samesite": "lax", "domain": s.cookie_domain, "path": "/"}
    resp.set_cookie("wp_access", access, max_age=s.access_token_minutes * 60, **common)
    if refresh:
        resp.set_cookie("wp_refresh", refresh, max_age=s.refresh_token_days * 86400, **common)


async def _first_tenant(db: AsyncSession, user: User) -> str | None:
    m = (await db.execute(select(Membership).where(Membership.user_id == user.id).order_by(Membership.created_at))).scalars().first()
    return m.tenant_id if m else None


def _user_dict(user: User) -> dict:
    return {"id": user.id, "email": user.email, "full_name": user.full_name,
            "email_verified": user.email_verified_at is not None, "is_operator": user.is_operator}


@router.post("/register", status_code=201, dependencies=[Depends(auth_rate_limit)])
async def register(data: RegisterIn, request: Request, db: AsyncSession = Depends(get_db)):
    if not (data.accept_terms and data.accept_privacy):
        from fastapi import HTTPException

        raise HTTPException(422, "Bitte AGB und Datenschutzerklärung akzeptieren.")
    trade = data.trade if data.trade in TRADES else "sonstiges"
    user, tenant = await auth_service.register(db, email=data.email, password=data.password, full_name=data.full_name,
                                               company=data.company, trade=trade, ip=client_ip(request))
    await db.commit()
    return {"message": "Registrierung erfolgreich. Bitte E-Mail-Adresse bestätigen.", "user_id": user.id, "tenant_id": tenant.id}


@router.post("/verify-email")
async def verify_email(payload: dict, response: Response, db: AsyncSession = Depends(get_db)):
    user = await auth_service.verify_email(db, str(payload.get("token", "")))
    tenant_id = await _first_tenant(db, user)
    await db.commit()
    access = create_access_token(user.id, tenant_id)
    _set_cookies(response, access, None)
    return TokenOut(access_token=access, tenant_id=tenant_id, user=_user_dict(user))


@router.post("/resend-verification", dependencies=[Depends(auth_rate_limit)])
async def resend_verification(payload: dict, db: AsyncSession = Depends(get_db)):
    email = str(payload.get("email", "")).lower().strip()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user and not user.email_verified_at:
        await auth_service.send_verification(db, user)
        await db.commit()
    return {"message": "Falls ein unbestätigtes Konto existiert, wurde eine neue Mail gesendet."}


@router.post("/login", response_model=TokenOut, dependencies=[Depends(auth_rate_limit)])
async def login(data: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    user, refresh = await auth_service.login(db, email=data.email, password=data.password, ip=client_ip(request),
                                             user_agent=request.headers.get("user-agent"))
    tenant_id = await _first_tenant(db, user)
    await db.commit()
    access = create_access_token(user.id, tenant_id)
    _set_cookies(response, access, refresh)
    return TokenOut(access_token=access, tenant_id=tenant_id, user=_user_dict(user))


@router.post("/refresh", response_model=TokenOut)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get("wp_refresh") or (await request.body()).decode() or ""
    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    token = request.cookies.get("wp_refresh") or body.get("refresh_token", "")
    user, new_refresh = await auth_service.rotate_refresh(db, token)
    tenant_id = (body.get("tenant_id") if isinstance(body, dict) else None) or await _first_tenant(db, user)
    if tenant_id:
        m = (await db.execute(select(Membership).where(Membership.user_id == user.id, Membership.tenant_id == tenant_id))).scalar_one_or_none()
        if not m:
            tenant_id = await _first_tenant(db, user)
    await db.commit()
    access = create_access_token(user.id, tenant_id)
    _set_cookies(response, access, new_refresh)
    return TokenOut(access_token=access, tenant_id=tenant_id, user=_user_dict(user))


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    await auth_service.revoke_refresh(db, request.cookies.get("wp_refresh"))
    await db.commit()
    for c in ("wp_access", "wp_refresh"):
        response.delete_cookie(c, path="/", domain=get_settings().cookie_domain)
    return {"message": "Abgemeldet."}


@router.post("/password/forgot", dependencies=[Depends(auth_rate_limit)])
async def forgot(payload: dict, db: AsyncSession = Depends(get_db)):
    await auth_service.request_password_reset(db, str(payload.get("email", "")))
    await db.commit()
    return {"message": "Falls ein Konto existiert, wurde eine E-Mail gesendet."}


@router.post("/password/reset", dependencies=[Depends(auth_rate_limit)])
async def reset(payload: dict, db: AsyncSession = Depends(get_db)):
    await auth_service.reset_password(db, str(payload.get("token", "")), str(payload.get("password", "")))
    await db.commit()
    return {"message": "Passwort geändert. Bitte neu anmelden."}


@router.get("/me")
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Membership, Tenant).join(Tenant, Tenant.id == Membership.tenant_id)
                             .where(Membership.user_id == user.id, Tenant.deleted_at.is_(None)))).all()
    return {"user": _user_dict(user),
            "tenants": [{"id": t.id, "name": t.name, "slug": t.slug, "role": m.role, "trade": t.trade} for m, t in rows]}


@router.post("/switch-tenant", response_model=TokenOut)
async def switch_tenant(payload: dict, response: Response, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    tenant_id = str(payload.get("tenant_id", ""))
    m = (await db.execute(select(Membership).where(Membership.user_id == user.id, Membership.tenant_id == tenant_id))).scalar_one_or_none()
    if not m:
        from fastapi import HTTPException

        raise HTTPException(403, "Kein Zugriff auf diesen Betrieb.")
    access = create_access_token(user.id, tenant_id)
    _set_cookies(response, access, None)
    return TokenOut(access_token=access, tenant_id=tenant_id, user=_user_dict(user))


@router.post("/invitations/accept")
async def accept_invitation(payload: dict, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    m = await auth_service.accept_invitation(db, token=str(payload.get("token", "")), user=user)
    await db.commit()
    return {"tenant_id": m.tenant_id, "role": m.role}
