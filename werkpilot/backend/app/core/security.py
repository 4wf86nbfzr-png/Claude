"""Passwörter (Argon2id), JWT-Zugriffstoken, Refresh-Sitzungen, Verschlüsselung sensibler Daten."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings
from app.core.db import utcnow

_ph = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=2)


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _ph.check_needs_rehash(password_hash)


# --- Tokens --------------------------------------------------------------------


def create_access_token(user_id: str, tenant_id: str | None, extra: dict[str, Any] | None = None) -> str:
    s = get_settings()
    now = utcnow()
    payload: dict[str, Any] = {
        "sub": user_id,
        "tid": tenant_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=s.access_token_minutes)).timestamp()),
        "typ": "access",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any] | None:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "access":
        return None
    return payload


def generate_token(nbytes: int = 32) -> str:
    """Zufälliges, URL-sicheres Token (für E-Mail-Bestätigung, Passwort-Reset, Refresh-Sitzungen)."""
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    """Tokens werden nur gehasht gespeichert, damit ein DB-Leak sie nicht nutzbar macht."""
    return hashlib.sha256(token.encode()).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


# --- Verschlüsselung (OAuth-Tokens, API-Schlüssel von Integrationen) ---------------


def _fernet() -> Fernet:
    s = get_settings()
    key = s.encryption_key
    if not key:
        # Entwicklungsfallback: aus SECRET_KEY ableiten. In Produktion ist ENCRYPTION_KEY Pflicht
        # (validate_for_production meldet das).
        key = base64.urlsafe_b64encode(hashlib.sha256(s.secret_key.encode()).digest()).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(cipher: str) -> str | None:
    try:
        return _fernet().decrypt(cipher.encode()).decode()
    except InvalidToken:
        return None


def sign_payload(payload: str, secret: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
