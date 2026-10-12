"""KI-Marketing: Keyword-Themen, SEO-Artikel/Anleitungen als Entwurf, Prüfungen (Qualität, Fakten, Rechte, Sicherheit),
Veröffentlichungsplan, Leistungsmessung. Veröffentlichung nur nach bestandenen Prüfungen UND (standardmäßig) Freigabe."""

from __future__ import annotations

import re
from datetime import timedelta

from sqlalchemy import func, select

from app.agents.base import AgentContext, BaseAgent
from app.core.db import utcnow
from app.core.system import KEY_AUTONOMY, get_setting
from app.models.ops import ContentPiece, Keyword
from app.services.ai_tasks import ContentBody, ContentOutline
from app.services.llm import LLMError, get_provider, run_structured

SEED_KEYWORDS = [
    ("Kundenanfragen Handwerk organisieren", "alle", "informational"),
    ("Angebot nachfassen Handwerker Vorlage", "alle", "commercial"),
    ("Terminvereinbarung Handwerksbetrieb automatisieren", "alle", "commercial"),
    ("Elektriker Büroorganisation Software", "elektro", "commercial"),
    ("SHK Betrieb Anfragen schneller beantworten", "shk", "informational"),
    ("Malerbetrieb Kundenanfragen E-Mail Vorlage", "maler", "informational"),
    ("Dachdecker Notfall Anfragen priorisieren", "dach", "informational"),
    ("Gebäudereinigung Angebotsanfragen verwalten", "reinigung", "commercial"),
    ("Garten- und Landschaftsbau Terminplanung Kunden", "galabau", "informational"),
    ("KI für Handwerksbetriebe DSGVO", "alle", "informational"),
]

FORBIDDEN_CLAIMS = re.compile(r"(garantiert|100 ?%|marktführer|testsieger|kunden berichten|erfahrungsberichte|bewertung(en)? von kunden|\d+ ?% mehr umsatz|spart ihnen \d+)", re.I)


def run_checks(piece: ContentPiece) -> dict:
    body = piece.body_markdown or ""
    words = len(body.split())
    quality = words >= 350 and body.count("\n## ") >= 2
    facts = not bool(FORBIDDEN_CLAIMS.search(body))
    rights = "©" not in body and not re.search(r"!\[.*\]\(http", body)  # keine fremden Bilder
    safety = not re.search(r"(ignore .*instructions|<script|javascript:)", body, re.I)
    return {"quality": quality, "facts": facts, "rights": rights, "safety": safety,
            "words": words, "passed": quality and facts and rights and safety, "checked_at": utcnow().isoformat()}


class MarketingAgent(BaseAgent):
    name = "marketing"
    max_runtime_seconds = 180
    max_cost_cents_per_run = 25

    async def execute(self, ctx: AgentContext) -> str:
        db = ctx.db
        # 1. Keywords sicherstellen
        existing = {k.term for k in (await db.execute(select(Keyword))).scalars().all()}
        added = 0
        for term, aud, intent in SEED_KEYWORDS:
            if term not in existing:
                db.add(Keyword(term=term, audience=aud, intent=intent, score=60 if intent == "commercial" else 45, source="seed"))
                added += 1
        if added:
            ctx.act(f"{added} Suchbegriffe angelegt.")
        await db.flush()

        # 2. Höchstens 1 neuen Entwurf pro Lauf erzeugen (Kostenkontrolle), nur wenn weniger als 3 in Prüfung
        in_review = (await db.execute(select(func.count(ContentPiece.id)).where(ContentPiece.status.in_(["draft", "review"])))).scalar_one()
        created = None
        if in_review < 3:
            used = {c.target_keyword for c in (await db.execute(select(ContentPiece))).scalars().all()}
            kw = (await db.execute(select(Keyword).where(Keyword.term.not_in(used) if used else True).order_by(Keyword.score.desc()))).scalars().first()
            if kw:
                try:
                    outline = await run_structured(db, task="content_outline", schema=ContentOutline, tenant_id=None,
                                                   instructions="Erstelle Titel, Slug, Meta-Description (max 155 Zeichen) und eine Gliederung (5-7 Abschnitte) für einen hilfreichen, sachlichen Ratgeberartikel für deutsche Handwerksbetriebe. Keine Erfolgsversprechen, keine erfundenen Zahlen oder Kundenstimmen.",
                                                   data=f"Keyword: {kw.term}\nZielgruppe: {kw.audience}\n", max_output_tokens=500)
                    body = await run_structured(db, task="content_body", schema=ContentBody, tenant_id=None,
                                                instructions="Schreibe den Artikel in Markdown (600-900 Wörter, Sie-Form, konkret, mit Zwischenüberschriften ##). Nur allgemein bekannte, überprüfbare Aussagen; keine Statistiken ohne Quelle; keine Kundenreferenzen. Liste alle Aussagen, die ein Mensch prüfen sollte.",
                                                data=f"Titel: {outline.title}\nKeyword: {outline.target_keyword}\nGliederung: {'; '.join(outline.outline)}\n", max_output_tokens=1800)
                    slug = re.sub(r"[^a-z0-9-]", "", outline.slug.lower())[:150] or f"artikel-{utcnow().strftime('%Y%m%d%H%M')}"
                    if (await db.execute(select(ContentPiece).where(ContentPiece.slug == slug))).scalar_one_or_none():
                        slug = f"{slug}-{utcnow().strftime('%m%d%H%M')}"
                    created = ContentPiece(slug=slug, title=outline.title[:300], kind="article", target_keyword=kw.term, audience=kw.audience,
                                           outline=outline.outline, body_markdown=body.body_markdown, meta_description=outline.meta_description[:300],
                                           status="draft", generated_by=f"marketing:{get_provider().name}",
                                           checks={"claims_to_verify": body.claims_to_verify})
                    db.add(created)
                    await db.flush()
                    ctx.act(f"Entwurf erstellt: {outline.title}")
                except LLMError as e:
                    ctx.find(f"Entwurf nicht erstellt: {e}")

        # 3. Prüfungen auf Entwürfen → review oder zurück
        drafts = (await db.execute(select(ContentPiece).where(ContentPiece.status == "draft"))).scalars().all()
        for d in drafts:
            checks = run_checks(d)
            d.checks = {**(d.checks or {}), **checks}
            if checks["passed"]:
                d.status = "review"
                await ctx.request_approval(kind="publish_content", title=f"Artikel veröffentlichen: {d.title}",
                                           description=(d.meta_description or "") + f"\n\nWörter: {checks['words']}\nZu prüfende Aussagen: " + "; ".join((d.checks or {}).get("claims_to_verify", []) or ["keine"]),
                                           payload={"content_id": d.id}, risk_level="low")
            else:
                ctx.find(f"Entwurf „{d.title}“ besteht Prüfung nicht: {', '.join(k for k in ('quality', 'facts', 'rights', 'safety') if not checks[k])}")

        # 4. Veröffentlichungsplan: freigegebene Inhalte zeitlich verteilen; automatisch veröffentlichen nur wenn erlaubt
        auto = await get_setting(db, KEY_AUTONOMY)
        approved = (await db.execute(select(ContentPiece).where(ContentPiece.status == "approved").order_by(ContentPiece.updated_at))).scalars().all()
        next_slot = utcnow() + timedelta(days=1)
        published = 0
        for a in approved:
            if not a.scheduled_for:
                a.scheduled_for = next_slot
                next_slot += timedelta(days=3)
            if a.scheduled_for <= utcnow() and auto.get("auto_publish_content", False) and (a.checks or {}).get("passed"):
                a.status = "published"
                a.published_at = utcnow()
                published += 1
                ctx.act(f"Veröffentlicht: {a.title}")

        # 5. Leistung: einfache Messung über Analytics-Daten (metrics werden extern über /api/admin/content gepflegt)
        stale = (await db.execute(select(ContentPiece).where(ContentPiece.status == "published", ContentPiece.published_at < utcnow() - timedelta(days=180)))).scalars().all()
        for s in stale[:3]:
            await ctx.propose_task(assigned_to="marketing", title=f"Inhalt aktualisieren: {s.title}", priority=6, dedupe_key=f"refresh:{s.id}")

        return f"{added} Keywords, {'1 Entwurf' if created else 'kein Entwurf'}, {len(drafts)} geprüft, {published} veröffentlicht."
