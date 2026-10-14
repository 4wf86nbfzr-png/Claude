"""Zentrale Konfiguration. Alle Secrets kommen aus Umgebungsvariablen (siehe .env.example)."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Allgemein ---
    app_name: str = "Clairify"
    env: Literal["development", "test", "production"] = "development"
    debug: bool = False
    base_url: str = "http://localhost:8000"  # Backend-URL (für OAuth-Redirects, Webhooks)
    frontend_url: str = "http://localhost:3000"  # Website/Dashboard (für E-Mail-Links, CORS)
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:3000"])

    # --- Datenbank / Cache ---
    database_url: str = "postgresql+asyncpg://werkpilot:werkpilot@localhost:5432/werkpilot"
    redis_url: str | None = None  # optional; ohne Redis läuft Rate-Limit im Prozessspeicher

    # --- Sicherheit ---
    secret_key: str = "dev-only-change-me-please-32-chars-min"
    encryption_key: str | None = None  # Fernet-Key für OAuth-Tokens u.ä. (siehe README)
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    cookie_secure: bool = False  # in Produktion True
    cookie_domain: str | None = None
    password_min_length: int = 10
    rate_limit_per_minute: int = 120
    auth_rate_limit_per_minute: int = 10
    trust_proxy_headers: bool = False

    # --- E-Mail-Versand ---
    email_provider: Literal["console", "resend", "smtp"] = "console"
    email_from: str = "Clairify <noreply@example.com>"
    resend_api_key: str | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = True
    inbound_email_webhook_secret: str | None = None  # Prüfsignatur für eingehende Mail-Webhooks

    # --- KI ---
    llm_provider: Literal["mock", "anthropic", "openai"] = "mock"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5-5"
    openai_api_key: str | None = None
    openai_model: str = "gpt-5-mini"
    llm_timeout_seconds: int = 45
    llm_max_output_tokens: int = 1200
    # Kostenlimits (in Cent). Werden zusätzlich pro Tarif/Tenant begrenzt.
    ai_global_daily_budget_cents: int = 2000
    ai_trial_total_budget_cents: int = 150
    ai_per_task_max_cents: int = 20

    # --- Stripe ---
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_publishable_key: str | None = None

    # --- Google Calendar (OAuth) ---
    google_client_id: str | None = None
    google_client_secret: str | None = None

    # --- Betrieb ---
    ops_alert_email: str | None = None  # Empfänger für kritische Betriebsmeldungen
    ops_alert_webhook_url: str | None = None  # z.B. Slack/Discord/Matrix Webhook
    worker_poll_seconds: float = 2.0
    job_max_attempts: int = 4
    backup_dir: str = "./backups"
    data_retention_days_default: int = 365
    trial_days: int = 14
    # Download-Links der Startseite. Leer = Knopf zeigt "in Vorbereitung" (nichts wird vorgetäuscht).
    download_windows_url: str | None = None
    download_macos_url: str | None = None
    download_ios_url: str | None = None  # App Store
    download_android_url: str | None = None  # Google Play
    download_linux_url: str | None = None
    trial_ai_calls_max: int = 40
    autonomy_enabled: bool = True  # Agenten dürfen geplante Läufe ausführen

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    def validate_for_production(self) -> list[str]:
        """Gibt eine Liste von Konfigurationsproblemen zurück, die vor dem Produktivstart gelöst sein müssen."""
        problems: list[str] = []
        if not self.is_production:
            return problems
        if "change-me" in self.secret_key or len(self.secret_key) < 32:
            problems.append("SECRET_KEY ist unsicher (mind. 32 zufällige Zeichen).")
        if not self.encryption_key:
            problems.append("ENCRYPTION_KEY fehlt (Fernet-Key für Integrationstokens).")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE muss in Produktion true sein.")
        if self.email_provider == "console":
            problems.append("EMAIL_PROVIDER=console versendet keine echten E-Mails.")
        if self.llm_provider == "mock":
            problems.append("LLM_PROVIDER=mock liefert nur regelbasierte Entwürfe.")
        if not self.stripe_secret_key or not self.stripe_webhook_secret:
            problems.append("Stripe-Schlüssel fehlen (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET).")
        if self.base_url.startswith("http://") or self.frontend_url.startswith("http://"):
            problems.append("BASE_URL/FRONTEND_URL müssen https verwenden.")
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
