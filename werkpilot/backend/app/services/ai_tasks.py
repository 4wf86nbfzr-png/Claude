"""Definierte KI-Aufgaben mit Schema. Der Mock-Anbieter hat für jede Aufgabe eine regelbasierte Variante,
damit System und Tests ohne API-Schlüssel laufen — erkennbar am Anbieter 'mock'."""

from __future__ import annotations

import re

from pydantic import BaseModel, Field

from app.services.llm import UNTRUSTED_CLOSE, UNTRUSTED_OPEN, MockProvider


class Classification(BaseModel):
    category: str = Field(description="eine von: notfall, reparatur, neuinstallation, wartung, angebot, terminfrage, rueckfrage, beschwerde, sonstiges, spam")
    priority: str = Field(description="low | normal | high | urgent")
    confidence: float = Field(ge=0, le=1)
    summary: str = Field(description="1-2 Sätze, sachlich, für den Betrieb")
    customer_name: str | None = None
    address: str | None = None
    preferred_time: str | None = None
    missing_info: list[str] = Field(default_factory=list, description="Was fehlt, um den Auftrag einzuschätzen")
    needs_human: bool = False
    needs_human_reason: str | None = None


class ReplyDraft(BaseModel):
    subject: str
    body: str
    tone_ok: bool = True
    contains_price_or_diagnosis: bool = Field(default=False, description="true, wenn der Text Preise/Diagnosen enthält (dann nicht automatisch senden)")
    confidence: float = Field(ge=0, le=1, default=0.7)


class Summary(BaseModel):
    summary: str
    open_points: list[str] = Field(default_factory=list)
    next_step: str | None = None


class SupportAnswer(BaseModel):
    category: str = Field(description="howto | bug | billing | feature | account | other")
    priority: str = Field(description="low | normal | high")
    answer: str
    confident: bool
    feature_exists: bool | None = Field(default=None, description="Bezieht sich die Frage auf eine bestätigte Funktion?")
    escalate: bool = False
    escalate_reason: str | None = None


class ContentOutline(BaseModel):
    title: str
    slug: str
    meta_description: str
    outline: list[str]
    target_keyword: str


class ContentBody(BaseModel):
    body_markdown: str
    claims_to_verify: list[str] = Field(default_factory=list)


class LeadFit(BaseModel):
    fit_score: int = Field(ge=0, le=100)
    reasons: list[str]
    suggested_next_action: str


class AnalysisFindings(BaseModel):
    summary: str
    findings: list[str] = Field(default_factory=list)
    proposals: list[str] = Field(default_factory=list)
    priorities: list[str] = Field(default_factory=list)


# --- Mock-Varianten (regelbasiert, konservativ) ------------------------------------------


def _untrusted(user: str) -> str:
    m = re.search(re.escape(UNTRUSTED_OPEN) + r"(.*?)" + re.escape(UNTRUSTED_CLOSE), user, re.S)
    return (m.group(1) if m else user).strip()


_URGENT = (
    "notfall",
    "wasserschaden",
    "rohrbruch",
    "stromausfall",
    "kein strom",
    "strom weg",
    "gasgeruch",
    "dringend",
    "sofort",
    "ausgefallen",
    "kein warmwasser",
    "brennt",
    "sturmschaden",
    "sturm",
    "regnet rein",
    "wasser läuft",
    "läuft aus",
    "überschwemmt",
    "kurzschluss",
)
_SPAM = ("seo-agentur", "backlinks", "crypto", "bitcoin", "gewinnspiel", "viagra", "casino")


def _mock_classify(user: str) -> dict:
    text = _untrusted(user)
    low = text.lower()
    body_text = re.sub(r"^Betreff:.*?\n\n", "", text, count=1, flags=re.S).strip() or text
    if any(k in low for k in _SPAM):
        return {"category": "spam", "priority": "low", "confidence": 0.8, "summary": "Vermutlich unerwünschte Werbung.", "missing_info": [], "needs_human": False}
    if any(k in low for k in _URGENT):
        cat, prio, conf = "notfall", "urgent", 0.85
    elif any(k in low for k in ("angebot", "kostenvoranschlag", "was kostet", "preis")):
        cat, prio, conf = "angebot", "normal", 0.75
    elif any(k in low for k in ("wartung", "inspektion", "jährlich")):
        cat, prio, conf = "wartung", "low", 0.7
    elif any(k in low for k in ("beschwerde", "unzufrieden", "reklamation", "mangel")):
        cat, prio, conf = "beschwerde", "high", 0.75
    elif any(k in low for k in ("defekt", "kaputt", "tropft", "funktioniert nicht", "reparatur")):
        cat, prio, conf = "reparatur", "high", 0.7
    elif any(k in low for k in ("termin", "wann", "vorbeikommen")):
        cat, prio, conf = "terminfrage", "normal", 0.7
    elif any(k in low for k in ("neu", "installation", "einbau", "austausch")):
        cat, prio, conf = "neuinstallation", "normal", 0.65
    else:
        cat, prio, conf = "sonstiges", "normal", 0.4
    missing = []
    if not re.search(r"\d{5}", text) and "straße" not in low and "str." not in low:
        missing.append("Adresse / Einsatzort")
    if not re.search(r"(\+49|0\d{2,5}[\s/-]?\d{3,})", text):
        missing.append("Telefonnummer für Rückfragen")
    if cat in ("reparatur", "notfall") and not any(k in low for k in ("foto", "bild", "modell", "typ")):
        missing.append("Gerät/Modell oder Foto")
    needs_human = cat in ("beschwerde", "sonstiges") or conf < 0.5
    return {
        "category": cat,
        "priority": prio,
        "confidence": conf,
        "summary": (body_text[:140] + ("…" if len(body_text) > 140 else "")).replace("\n", " "),
        "customer_name": None,
        "address": None,
        "preferred_time": None,
        "missing_info": missing,
        "needs_human": needs_human,
        "needs_human_reason": "Beschwerde oder unklare Anfrage" if needs_human else None,
    }


def _mock_reply(user: str) -> dict:
    m = re.search(r"Signatur: (.*?)\n", user) or re.search(r"Betrieb: (.*?)\n", user)
    firma = m.group(1).strip() if m else "unser Betrieb"
    name_m = re.search(r"Absender: (.*?)\n", user)
    name = name_m.group(1).strip() if name_m else ""
    missing_m = re.search(r"Fehlende Angaben: (.*?)\n", user)
    missing = [x.strip() for x in missing_m.group(1).split(";") if x.strip()] if missing_m and missing_m.group(1).strip() not in ("", "-") else []
    slots_m = re.search(r"Terminvorschläge: (.*?)\n", user)
    slots = [x.strip() for x in slots_m.group(1).split(";") if x.strip()] if slots_m and slots_m.group(1).strip() not in ("", "-") else []
    greeting = f"Guten Tag{(' ' + name) if name else ''},"
    parts = [greeting, "", "vielen Dank für Ihre Anfrage. Wir haben sie erhalten und melden uns zeitnah."]
    if missing:
        parts += ["", "Damit wir den Aufwand einschätzen können, bräuchten wir noch:"] + [f"- {x}" for x in missing]
    if slots:
        parts += ["", "Für einen Termin vor Ort könnten wir anbieten:"] + [f"- {x}" for x in slots] + ["", "Passt einer der Termine? Dann bestätigen Sie ihn bitte kurz."]
    parts += ["", "Freundliche Grüße", firma]
    return {"subject": "Ihre Anfrage – Rückmeldung", "body": "\n".join(parts), "tone_ok": True, "contains_price_or_diagnosis": False, "confidence": 0.7}


def _mock_summary(user: str) -> dict:
    text = _untrusted(user)
    return {"summary": text[:300].replace("\n", " "), "open_points": [], "next_step": None}


def _mock_support(user: str) -> dict:
    text = _untrusted(user).lower()
    if any(k in text for k in ("rechnung", "zahlung", "kündig", "abo", "tarif")):
        return {
            "category": "billing",
            "priority": "normal",
            "confident": True,
            "feature_exists": True,
            "escalate": False,
            "answer": "Abonnement, Rechnungen und Kündigung verwalten Sie im Dashboard unter Abonnement → „Abo verwalten“. Dort gelangen Sie ins Kundenportal unseres Zahlungsanbieters Stripe.",
        }
    if any(k in text for k in ("fehler", "geht nicht", "funktioniert nicht", "bug", "absturz")):
        return {
            "category": "bug",
            "priority": "high",
            "confident": False,
            "feature_exists": None,
            "escalate": True,
            "escalate_reason": "Möglicher Fehler – manuelle Prüfung nötig.",
            "answer": "Danke für die Meldung. Wir haben einen Supportfall angelegt und prüfen das. Sie bekommen eine Rückmeldung per E-Mail.",
        }
    if any(k in text for k in ("whatsapp", "telefon", "anruf", "sms")):
        return {
            "category": "feature",
            "priority": "normal",
            "confident": True,
            "feature_exists": False,
            "escalate": False,
            "answer": "Aktuell verarbeitet Clairify Anfragen per E-Mail und Kontaktformular. WhatsApp- oder Telefonanbindungen sind noch nicht verfügbar; wir nehmen den Wunsch auf.",
        }
    return {
        "category": "howto",
        "priority": "normal",
        "confident": False,
        "feature_exists": None,
        "escalate": True,
        "escalate_reason": "Frage nicht eindeutig zuordenbar.",
        "answer": "Danke für Ihre Nachricht. Ein Mensch aus unserem Team sieht sich das an und meldet sich.",
    }


def _mock_outline(user: str) -> dict:
    kw_m = re.search(r"Keyword: (.*?)\n", user)
    kw = kw_m.group(1).strip() if kw_m else "Kundenanfragen Handwerk"
    slug = re.sub(r"[^a-z0-9]+", "-", kw.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")).strip("-")
    return {
        "title": f"{kw}: So organisieren kleine Betriebe das ohne Mehraufwand",
        "slug": slug,
        "meta_description": f"Praktische Anleitung zu {kw} für Handwerksbetriebe: Reaktionszeit senken, nichts vergessen, weniger Büroarbeit.",
        "outline": ["Warum das Thema Zeit kostet", "Typische Fehler", "Ein einfacher Ablauf in 5 Schritten", "Was sich automatisieren lässt", "Checkliste"],
        "target_keyword": kw,
    }


def _mock_body(user: str) -> dict:
    title_m = re.search(r"Titel: (.*?)\n", user)
    title = title_m.group(1).strip() if title_m else "Anleitung"
    body = f"# {title}\n\n## Warum das Thema Zeit kostet\n\nAnfragen kommen per E-Mail, Telefon und Formular – und meist dann, wenn man auf der Baustelle steht.\n\n## Ein einfacher Ablauf in 5 Schritten\n\n1. Alle Anfragen an einem Ort sammeln.\n2. Innerhalb eines Werktags eine erste Rückmeldung geben.\n3. Fehlende Angaben gezielt nachfragen (Adresse, Telefon, Foto).\n4. Zwei Terminvorschläge statt offener Rückfrage.\n5. Offene Angebote nach 5 Werktagen nachfassen.\n\n## Checkliste\n\n- [ ] Zentrale Eingangsadresse\n- [ ] Antwortvorlagen\n- [ ] Erinnerung für offene Angebote\n"
    return {"body_markdown": body, "claims_to_verify": []}


def _mock_leadfit(user: str) -> dict:
    text = user.lower()
    score = 50
    reasons = []
    if any(t in text for t in ("elektro", "sanitär", "shk", "heizung", "maler", "dachdecker", "gebäudereinig", "garten", "bau")):
        score += 25
        reasons.append("Zielbranche")
    if any(s in text for s in ("2-5", "6-15")):
        score += 15
        reasons.append("Passende Betriebsgröße")
    if "solo" in text:
        score -= 10
        reasons.append("Einzelbetrieb – geringeres Budget")
    return {
        "fit_score": max(0, min(100, score)),
        "reasons": reasons or ["Keine Branchenangabe"],
        "suggested_next_action": "Demo-Termin anbieten" if score >= 60 else "Informationsmaterial senden",
    }


def _mock_analysis(user: str) -> dict:
    return {"summary": "Regelbasierte Auswertung (kein LLM konfiguriert).", "findings": [], "proposals": [], "priorities": []}


MockProvider.handlers.update(
    {
        "classify_inquiry": _mock_classify,
        "draft_reply": _mock_reply,
        "summarize": _mock_summary,
        "support_answer": _mock_support,
        "content_outline": _mock_outline,
        "content_body": _mock_body,
        "lead_fit": _mock_leadfit,
        "analysis": _mock_analysis,
    }
)
