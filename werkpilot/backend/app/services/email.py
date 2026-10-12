"""E-Mail-Versand über austauschbare Anbieter. Ohne Anbieter wird NICHT so getan, als wäre gesendet worden:
Status 'simulated' wird protokolliert und im Dashboard angezeigt."""

from __future__ import annotations

import smtplib
from email.message import EmailMessage

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.logging import get_logger
from app.models.ops import OutboundEmail

log = get_logger("email")


class EmailResult:
    def __init__(self, status: str, provider: str, message_id: str | None = None, error: str | None = None):
        self.status = status  # sent | simulated | failed
        self.provider = provider
        self.message_id = message_id
        self.error = error

    @property
    def ok(self) -> bool:
        return self.status == "sent"


class EmailProvider:
    name = "base"

    async def send(self, to: str, subject: str, text: str, html: str | None, reply_to: str | None) -> EmailResult:
        raise NotImplementedError


class ConsoleProvider(EmailProvider):
    name = "console"
    sent: list[dict] = []  # für Tests einsehbar

    async def send(self, to, subject, text, html, reply_to) -> EmailResult:
        log.info("email.simulated", to=to, subject=subject)
        ConsoleProvider.sent.append({"to": to, "subject": subject, "text": text, "reply_to": reply_to})
        return EmailResult("simulated", self.name)


class ResendProvider(EmailProvider):
    name = "resend"

    async def send(self, to, subject, text, html, reply_to) -> EmailResult:
        s = get_settings()
        payload = {"from": s.email_from, "to": [to], "subject": subject, "text": text}
        if html:
            payload["html"] = html
        if reply_to:
            payload["reply_to"] = reply_to
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    "https://api.resend.com/emails",
                    json=payload,
                    headers={"Authorization": f"Bearer {s.resend_api_key}"},
                )
            if r.status_code >= 300:
                return EmailResult("failed", self.name, error=f"HTTP {r.status_code}: {r.text[:300]}")
            return EmailResult("sent", self.name, message_id=r.json().get("id"))
        except Exception as e:  # noqa: BLE001
            return EmailResult("failed", self.name, error=str(e)[:300])


class SMTPProvider(EmailProvider):
    name = "smtp"

    async def send(self, to, subject, text, html, reply_to) -> EmailResult:
        s = get_settings()
        msg = EmailMessage()
        msg["From"] = s.email_from
        msg["To"] = to
        msg["Subject"] = subject
        if reply_to:
            msg["Reply-To"] = reply_to
        msg.set_content(text)
        if html:
            msg.add_alternative(html, subtype="html")
        try:
            import asyncio

            def _send():
                with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
                    if s.smtp_starttls:
                        smtp.starttls()
                    if s.smtp_user:
                        smtp.login(s.smtp_user, s.smtp_password or "")
                    smtp.send_message(msg)

            await asyncio.get_running_loop().run_in_executor(None, _send)
            return EmailResult("sent", self.name)
        except Exception as e:  # noqa: BLE001
            return EmailResult("failed", self.name, error=str(e)[:300])


_provider: EmailProvider | None = None


def get_email_provider() -> EmailProvider:
    global _provider
    s = get_settings()
    if _provider is not None and _provider.name == s.email_provider:
        return _provider
    if s.email_provider == "resend" and s.resend_api_key:
        _provider = ResendProvider()
    elif s.email_provider == "smtp" and s.smtp_host:
        _provider = SMTPProvider()
    else:
        _provider = ConsoleProvider()
    return _provider


def email_is_live() -> bool:
    return get_email_provider().name != "console"


async def send_email(
    db: AsyncSession,
    *,
    to: str,
    subject: str,
    text: str,
    html: str | None = None,
    reply_to: str | None = None,
    kind: str = "transactional",
    tenant_id: str | None = None,
) -> EmailResult:
    provider = get_email_provider()
    result = await provider.send(to, subject, text, html, reply_to)
    db.add(
        OutboundEmail(
            created_at=utcnow(),
            tenant_id=tenant_id,
            to_email=to,
            subject=subject[:300],
            kind=kind,
            provider=result.provider,
            status=result.status,
            provider_message_id=result.message_id,
            error=result.error,
        )
    )
    await db.flush()
    if result.status == "failed":
        log.warning("email.failed", to=to, error=result.error)
    return result
