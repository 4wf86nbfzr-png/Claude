"""Registrierung, E-Mail-Bestätigung, Login mit Sperre, Refresh-Sitzungen, Passwort-Reset, Einladungen."""

from __future__ import annotations

import re
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.config import get_settings
from app.core.db import utcnow
from app.core.security import generate_token, hash_password, hash_token, verify_password
from app.models.core import ROLE_OWNER, Invitation, Membership, OneTimeToken, RefreshSession, Tenant, User
from app.services.email import send_email
from app.services.features import start_trial

COMMON_FRAGMENTS = ("password", "passwort", "12345678", "qwertz", "qwerty", "werkpilot", "handwerk", "abcdefg", "11111111")


def validate_password(pw: str) -> None:
    s = get_settings()
    if len(pw) < s.password_min_length:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Passwort muss mind. {s.password_min_length} Zeichen haben.")
    low = pw.lower()
    if any(f in low for f in COMMON_FRAGMENTS) or len(set(pw)) < 5 or low.isdigit():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Passwort ist zu einfach (häufiges Wort oder zu wenig Vielfalt).")


def slugify(name: str) -> str:
    s = name.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60] or "betrieb"


async def unique_slug(db: AsyncSession, base: str) -> str:
    slug = base
    i = 2
    while (await db.execute(select(Tenant.id).where(Tenant.slug == slug))).scalar_one_or_none():
        slug = f"{base}-{i}"
        i += 1
    return slug


async def register(db: AsyncSession, *, email: str, password: str, full_name: str, company: str, trade: str,
                   ip: str | None = None) -> tuple[User, Tenant]:
    validate_password(password)
    email = email.lower().strip()
    exists = (await db.execute(select(User.id).where(User.email == email))).scalar_one_or_none()
    if exists:
        # Kein Enumerationsleck: gleiche Antwort wie Erfolg, aber Mail an bestehenden Nutzer
        raise HTTPException(status.HTTP_409_CONFLICT, "Mit dieser E-Mail existiert bereits ein Konto. Bitte anmelden oder Passwort zurücksetzen.")
    user = User(email=email, password_hash=hash_password(password), full_name=full_name.strip()[:200])
    db.add(user)
    await db.flush()
    tenant = Tenant(name=company.strip()[:200], slug=await unique_slug(db, slugify(company)), trade=trade,
                    contact_email=email, settings={"auto_reply_enabled": False, "auto_reply_min_confidence": 0.8})
    db.add(tenant)
    await db.flush()
    db.add(Membership(user_id=user.id, tenant_id=tenant.id, role=ROLE_OWNER))
    await start_trial(db, tenant.id)
    await send_verification(db, user)
    await audit(db, "user.registered", actor_type="user", actor_id=user.id, tenant_id=tenant.id,
                details={"ip": ip, "trade": trade})
    return user, tenant


async def _issue_one_time(db: AsyncSession, user: User, purpose: str, hours: int) -> str:
    token = generate_token()
    db.add(OneTimeToken(user_id=user.id, purpose=purpose, token_hash=hash_token(token),
                        expires_at=utcnow() + timedelta(hours=hours)))
    await db.flush()
    return token


async def send_verification(db: AsyncSession, user: User) -> None:
    s = get_settings()
    token = await _issue_one_time(db, user, "verify_email", 48)
    link = f"{s.frontend_url}/bestaetigen?token={token}"
    await send_email(
        db, to=user.email, subject="Bitte bestätigen Sie Ihre E-Mail-Adresse – WerkPilot AI",
        text=(f"Moin {user.full_name or ''},\n\nbitte bestätigen Sie Ihre E-Mail-Adresse über diesen Link "
              f"(48 Stunden gültig):\n{link}\n\nFalls Sie sich nicht registriert haben, ignorieren Sie diese Mail.\n\n"
              "WerkPilot AI"),
        kind="transactional",
    )


async def consume_one_time(db: AsyncSession, token: str, purpose: str) -> User:
    row = (await db.execute(select(OneTimeToken).where(OneTimeToken.token_hash == hash_token(token),
                                                       OneTimeToken.purpose == purpose))).scalar_one_or_none()
    if not row or row.used_at or row.expires_at < utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Link ungültig oder abgelaufen.")
    row.used_at = utcnow()
    user = await db.get(User, row.user_id)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Konto nicht gefunden.")
    return user


async def verify_email(db: AsyncSession, token: str) -> User:
    user = await consume_one_time(db, token, "verify_email")
    if not user.email_verified_at:
        user.email_verified_at = utcnow()
    await audit(db, "user.email_verified", actor_type="user", actor_id=user.id)
    return user


async def login(db: AsyncSession, *, email: str, password: str, ip: str | None, user_agent: str | None) -> tuple[User, str]:
    email = email.lower().strip()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    generic = HTTPException(status.HTTP_401_UNAUTHORIZED, "E-Mail oder Passwort ist falsch.")
    if not user:
        # Timing angleichen
        verify_password(password, "$argon2id$v=19$m=65536,t=3,p=2$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
        raise generic
    if user.locked_until and user.locked_until > utcnow():
        raise HTTPException(status.HTTP_423_LOCKED, "Konto vorübergehend gesperrt. Bitte in 15 Minuten erneut versuchen.")
    if not user.is_active or not verify_password(password, user.password_hash):
        user.failed_logins += 1
        if user.failed_logins >= 8:
            user.locked_until = utcnow() + timedelta(minutes=15)
            await audit(db, "user.locked", actor_type="system", actor_id="auth", details={"user_id": user.id, "ip": ip},
                        severity="security")
        await db.commit()  # Fehlversuch auch bei Abbruch festhalten
        raise generic
    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = utcnow()
    refresh = generate_token(48)
    db.add(RefreshSession(user_id=user.id, token_hash=hash_token(refresh),
                          expires_at=utcnow() + timedelta(days=get_settings().refresh_token_days),
                          user_agent=(user_agent or "")[:300], ip=ip))
    await audit(db, "user.login", actor_type="user", actor_id=user.id, details={"ip": ip})
    await db.flush()
    return user, refresh


async def rotate_refresh(db: AsyncSession, refresh_token: str) -> tuple[User, str]:
    sess = (await db.execute(select(RefreshSession).where(RefreshSession.token_hash == hash_token(refresh_token)))).scalar_one_or_none()
    if not sess or sess.revoked_at or sess.expires_at < utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sitzung abgelaufen. Bitte neu anmelden.")
    user = await db.get(User, sess.user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Konto nicht aktiv.")
    sess.revoked_at = utcnow()
    new_token = generate_token(48)
    db.add(RefreshSession(user_id=user.id, token_hash=hash_token(new_token), expires_at=sess.expires_at,
                          user_agent=sess.user_agent, ip=sess.ip))
    await db.flush()
    return user, new_token


async def revoke_refresh(db: AsyncSession, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    sess = (await db.execute(select(RefreshSession).where(RefreshSession.token_hash == hash_token(refresh_token)))).scalar_one_or_none()
    if sess and not sess.revoked_at:
        sess.revoked_at = utcnow()
        await db.flush()


async def revoke_all_sessions(db: AsyncSession, user_id: str) -> None:
    rows = (await db.execute(select(RefreshSession).where(RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None)))).scalars().all()
    for r in rows:
        r.revoked_at = utcnow()
    await db.flush()


async def request_password_reset(db: AsyncSession, email: str) -> None:
    s = get_settings()
    user = (await db.execute(select(User).where(User.email == email.lower().strip()))).scalar_one_or_none()
    if not user:
        return  # keine Auskunft, ob Konto existiert
    token = await _issue_one_time(db, user, "reset_password", 2)
    link = f"{s.frontend_url}/passwort-neu?token={token}"
    await send_email(db, to=user.email, subject="Passwort zurücksetzen – WerkPilot AI",
                     text=f"Über diesen Link (2 Stunden gültig) setzen Sie ein neues Passwort:\n{link}\n\nFalls Sie das nicht angefordert haben, ignorieren Sie diese Mail.")


async def reset_password(db: AsyncSession, token: str, new_password: str) -> User:
    validate_password(new_password)
    user = await consume_one_time(db, token, "reset_password")
    user.password_hash = hash_password(new_password)
    user.failed_logins = 0
    user.locked_until = None
    await revoke_all_sessions(db, user.id)
    await audit(db, "user.password_reset", actor_type="user", actor_id=user.id, severity="security")
    return user


async def invite_member(db: AsyncSession, tenant: Tenant, *, email: str, role: str, invited_by: str, max_users: int | None) -> Invitation:
    email = email.lower().strip()
    if max_users is not None:
        count = (await db.execute(select(func.count(Membership.id)).where(Membership.tenant_id == tenant.id))).scalar_one()
        if count >= max_users:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Der Tarif erlaubt maximal {max_users} Nutzer.")
    token = generate_token()
    inv = Invitation(tenant_id=tenant.id, email=email, role=role, token_hash=hash_token(token),
                     expires_at=utcnow() + timedelta(days=7), invited_by=invited_by)
    db.add(inv)
    await db.flush()
    link = f"{get_settings().frontend_url}/einladung?token={token}"
    await send_email(db, to=email, subject=f"Einladung zu {tenant.name} bei WerkPilot AI",
                     text=f"Sie wurden zu „{tenant.name}“ bei WerkPilot AI eingeladen. Link (7 Tage gültig):\n{link}",
                     tenant_id=tenant.id)
    return inv


async def accept_invitation(db: AsyncSession, *, token: str, user: User) -> Membership:
    inv = (await db.execute(select(Invitation).where(Invitation.token_hash == hash_token(token)))).scalar_one_or_none()
    if not inv or inv.accepted_at or inv.expires_at < utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Einladung ungültig oder abgelaufen.")
    if inv.email != user.email:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Die Einladung gilt für eine andere E-Mail-Adresse.")
    inv.accepted_at = utcnow()
    existing = (await db.execute(select(Membership).where(Membership.user_id == user.id, Membership.tenant_id == inv.tenant_id))).scalar_one_or_none()
    if existing:
        return existing
    m = Membership(user_id=user.id, tenant_id=inv.tenant_id, role=inv.role)
    db.add(m)
    await db.flush()
    return m
