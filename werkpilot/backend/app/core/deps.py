"""FastAPI-Abhängigkeiten: aktueller Nutzer, Mandant, Rollenprüfung (serverseitig, immer)."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.core import ROLE_ADMIN, ROLE_OWNER, Membership, Tenant, User


@dataclass
class AuthContext:
    user: User
    tenant: Tenant | None
    membership: Membership | None

    @property
    def role(self) -> str | None:
        return self.membership.role if self.membership else None

    @property
    def tenant_id(self) -> str:
        assert self.tenant is not None
        return self.tenant.id


def _extract_token(request: Request, authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return request.cookies.get("wp_access")


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    token = _extract_token(request, authorization)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Nicht angemeldet.")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sitzung abgelaufen oder ungültig.")
    user = await db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Konto nicht aktiv.")
    request.state.token_payload = payload
    return user


async def get_auth_context(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    x_tenant_id: str | None = Header(default=None),
) -> AuthContext:
    """Mandant aus Token (tid) oder Header. Die Mitgliedschaft wird IMMER in der DB geprüft."""
    payload = getattr(request.state, "token_payload", {})
    tenant_id = x_tenant_id or payload.get("tid")
    if not tenant_id:
        return AuthContext(user=user, tenant=None, membership=None)
    membership = (
        await db.execute(
            select(Membership).where(Membership.user_id == user.id, Membership.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Kein Zugriff auf diesen Betrieb.")
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None or not tenant.is_active or tenant.deleted_at is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Betrieb nicht aktiv.")
    return AuthContext(user=user, tenant=tenant, membership=membership)


async def require_tenant(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
    if ctx.tenant is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Kein Betrieb ausgewählt.")
    if not ctx.user.email_verified_at:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bitte zuerst die E-Mail-Adresse bestätigen.")
    return ctx


def require_role(*roles: str):
    async def _dep(ctx: AuthContext = Depends(require_tenant)) -> AuthContext:
        if ctx.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Dafür fehlt die Berechtigung.")
        return ctx

    return _dep


require_admin = require_role(ROLE_OWNER, ROLE_ADMIN)
require_owner = require_role(ROLE_OWNER)


async def require_operator(user: User = Depends(get_current_user)) -> User:
    """Betreiber von WerkPilot (nicht Kunde). Steuert Tarife, Not-Aus, Freigaben, Agenten."""
    if not user.is_operator:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nur für Betreiber.")
    return user
