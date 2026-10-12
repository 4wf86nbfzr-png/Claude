"""WerkPilot AI – FastAPI-Anwendung."""

from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import admin, auth, billing, health, inquiries, integrations, public, support, tenant
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.logging import configure_logging, get_logger
from app.core.ratelimit import rate_limit_dependency
from app.services.features import ensure_default_plans
from app.services.jobs import record_error
from app.workers import handlers  # noqa: F401 – Job-Handler registrieren

log = get_logger("api")


async def seed_knowledge(db) -> None:
    from sqlalchemy import select

    from app.models.ops import KnowledgeArticle

    if (await db.execute(select(KnowledgeArticle.id).limit(1))).scalar_one_or_none():
        return
    articles = [
        ("erste-schritte", "Erste Schritte", "einrichtung", "1. E-Mail bestätigen. 2. Betriebsdaten und Geschäftszeiten eintragen. 3. Kontaktformular oder E-Mail-Weiterleitung verbinden. 4. Erste Anfrage anlegen oder eingehen lassen. 5. Entwurf prüfen und freigeben."),
        ("anfragen-erfassen", "Wie kommen Anfragen in WerkPilot?", "anfragen", "Per Kontaktformular Ihrer Website (Webhook mit Secret), per E-Mail-Weiterleitung an Ihre WerkPilot-Eingangsadresse oder manuell im Dashboard (z.B. nach einem Anruf)."),
        ("entwuerfe-freigeben", "Antwortentwürfe prüfen und senden", "anfragen", "Jede KI-Antwort ist ein Entwurf. Unter „Entwürfe“ sehen Sie Text, Hinweise (z.B. geringe Sicherheit) und Terminvorschläge. Sie können bearbeiten, freigeben oder verwerfen. Automatisches Senden ist ab Tarif Business und nur ohne Warnhinweise möglich."),
        ("terminvorschlaege", "Woher kommen Terminvorschläge?", "termine", "Aus Ihren Geschäftszeiten abzüglich bereits vergebener Termine. Mit verbundenem Google Kalender werden auch dortige Belegungen berücksichtigt. Bestätigte Termine werden in den Kalender eingetragen."),
        ("angebote-nachfassen", "Erinnerung an offene Angebote", "angebote", "Tragen Sie ein gestelltes Angebot ein. Nach der eingestellten Frist (Standard 5 Tage) erinnert WerkPilot Sie und legt einen Nachfass-Entwurf an. Preise werden nie von der KI festgelegt."),
        ("abo-und-rechnungen", "Abonnement, Rechnungen, Kündigung", "abrechnung", "Unter Abonnement → „Abo verwalten“ gelangen Sie ins Stripe-Kundenportal: Tarif wechseln, Zahlungsmittel ändern, Rechnungen laden, kündigen. Die Kündigung gilt zum Ende des Abrechnungszeitraums."),
        ("datenschutz-export-loeschung", "Datenexport und Kontolöschung", "datenschutz", "Inhaber können unter Einstellungen alle Daten als JSON exportieren und den Betrieb löschen. Daten werden nach der eingestellten Aufbewahrungsfrist endgültig entfernt."),
        ("was-die-ki-nicht-tut", "Was die KI bewusst nicht tut", "allgemein", "Keine Preise, keine technischen Diagnosen, keine rechtsverbindlichen Zusagen. Unsichere Fälle werden zur Prüfung markiert."),
    ]
    for slug, title, cat, body in articles:
        db.add(KnowledgeArticle(slug=slug, title=title, category=cat, body=body))


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    s = get_settings()
    problems = s.validate_for_production()
    for p in problems:
        log.warning("config.production_problem", problem=p)
    async with get_sessionmaker()() as db:
        await ensure_default_plans(db)
        await seed_knowledge(db)
        await db.commit()
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="WerkPilot AI API", version="0.1.0", lifespan=lifespan,
                  docs_url="/api/docs" if not s.is_production else None, redoc_url=None, openapi_url="/api/openapi.json" if not s.is_production else None)
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def security_and_logging(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        structlog.contextvars.bind_contextvars(request_id=rid, path=request.url.path)
        start = time.perf_counter()
        try:
            if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/billing/webhook"):
                await rate_limit_dependency(request)
            response = await call_next(request)
        except StarletteHTTPException as e:
            response = JSONResponse({"detail": e.detail}, status_code=e.status_code)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if s.cookie_secure:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        dur = int((time.perf_counter() - start) * 1000)
        if request.url.path != "/health":
            log.info("http", method=request.method, status=response.status_code, ms=dur)
        structlog.contextvars.clear_contextvars()
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse({"detail": "Eingabe ungültig.", "errors": [{"loc": e.get("loc"), "msg": e.get("msg")} for e in exc.errors()]}, status_code=422)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.error("unhandled", error=str(exc)[:300], exc_info=True)
        try:
            async with get_sessionmaker()() as db:
                await record_error(db, source="api", message=f"{type(exc).__name__}: {str(exc)[:300]}", stack=None, context={"path": request.url.path, "method": request.method})
                await db.commit()
        except Exception:  # noqa: BLE001
            pass
        return JSONResponse({"detail": "Interner Fehler. Wir wurden benachrichtigt."}, status_code=500)

    for r in (health.router, auth.router, tenant.router, inquiries.router, billing.router, integrations.router, public.router, support.router, admin.router):
        app.include_router(r)
    return app


app = create_app()
