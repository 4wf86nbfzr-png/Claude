"""Website-Assistent: beantwortet Fragen von Besuchern zu Clairify und dem Unternehmen.

Grundsatz: Es wird nur geantwortet, was in WISSEN steht. Ohne KI-Anbieter antwortet ein
regelbasierter Teil (Themen nach Stichwörtern), mit KI-Anbieter formuliert das Sprachmodell
kurz und menschlich, aber ausschließlich auf Basis desselben Wissens. Fragen werden nicht
gespeichert; nur die KI-Kosten werden wie bei jeder Aufgabe erfasst.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

from app.services.llm import UNTRUSTED_CLOSE, UNTRUSTED_OPEN, MockProvider

# Jedes Thema: Stichwörter für die regelbasierte Antwort und der Fakt, den auch das Sprachmodell nutzt.
# Die Wissensliste liegt als JSON neben dieser Datei, damit auch die Einzeldatei-Vorschau
# (frontend/tools/preview) dieselbe Quelle nutzt.
WISSEN: list[dict] = json.loads((Path(__file__).with_name("assistant_wissen.json")).read_text(encoding="utf-8"))["themen"]

UNBEKANNT = "Das kann ich nicht sicher sagen. Am besten schreiben Sie uns kurz über das Kontaktformular, wir melden uns innerhalb eines Werktags."
ANTWORT_MAX = 500


class AssistantAnswer(BaseModel):
    answer: str = Field(max_length=ANTWORT_MAX)
    unsure: bool = False


def knowledge_text() -> str:
    return "\n".join(f"- {w['thema']}: {w['fakt']}" for w in WISSEN)


def _untrusted(user: str) -> str:
    if UNTRUSTED_OPEN in user and UNTRUSTED_CLOSE in user:
        return user.split(UNTRUSTED_OPEN, 1)[1].split(UNTRUSTED_CLOSE, 1)[0].strip()
    return user


def rule_based_answer(question: str) -> AssistantAnswer:
    """Wählt das Thema mit den meisten Stichworttreffern. Kein Treffer: ehrliches 'weiß ich nicht'."""
    q = question.lower()
    best, score = None, 0
    for w in WISSEN:
        n = sum(1 for k in w["stichworte"] if k in q)
        if n > score:
            best, score = w, n
    if not best:
        return AssistantAnswer(answer=UNBEKANNT, unsure=True)
    return AssistantAnswer(answer=best["fakt"][:ANTWORT_MAX], unsure=False)


def _mock_assistant(user: str) -> dict:
    return rule_based_answer(_untrusted(user)).model_dump()


MockProvider.handlers.update({"website_assistant": _mock_assistant})

INSTRUCTIONS = (
    "Du bist der Website-Assistent von Clairify und sprichst mit Besuchern der Website. "
    "Antworte kurz (höchstens drei Sätze), freundlich, menschlich und in der Sie-Form, ohne Floskeln. "
    "Du darfst ausschließlich Fakten aus der Wissensliste verwenden. Steht etwas nicht darin, sag ehrlich, "
    "dass du es nicht sicher weißt, und verweise auf das Kontaktformular (unsure=true). "
    "Erfinde keine Funktionen, Zahlen, Namen, Adressen oder Zusagen. Keine Rechts- oder Steuerberatung.\n\n"
    "Wissensliste:\n" + knowledge_text()
)
