"""Gedaechtnis: Kurzzeit, Langzeit, Wissen.

Nicht jede Unterhaltung wird fuer immer gespeichert. Das Kurzzeitgedaechtnis
ist ein Fenster ueber das laufende Gespraech; ins Langzeitgedaechtnis kommt
nur, was ausdruecklich als Fakt oder Praeferenz abgelegt wird.

Widersprueche werden *nicht* stillschweigend ueberschrieben. Ein neuer Wert
zu einem bestehenden Fakt gilt als Widerspruch und wird gemeldet -- JARVIS
soll nachfragen, statt eine von zwei Angaben zu verlieren.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from .db import Database


@dataclass(slots=True)
class Turn:
    role: str
    content: str
    created_at: float


@dataclass(slots=True)
class Fact:
    id: int
    subject: str
    predicate: str
    value: str
    kind: str
    confidence: float
    source: str | None
    created_at: float

    def as_sentence(self) -> str:
        return f"{self.subject} {self.predicate}: {self.value}"


class Contradiction(Exception):
    """Ein neuer Wert widerspricht einem gespeicherten Fakt.

    Traegt den alten Fakt mit, damit JARVIS konkret nachfragen kann
    ("Du hattest X gesagt, jetzt Y -- was gilt?").
    """

    def __init__(self, existing: Fact, new_value: str) -> None:
        super().__init__(
            f"'{existing.subject} {existing.predicate}' ist als '{existing.value}' "
            f"gespeichert, neu waere '{new_value}'."
        )
        self.existing = existing
        self.new_value = new_value


class ShortTermMemory:
    """Das laufende Gespraech.

    Begrenzt ueber ``window``: ins Modell geht nur das Fenster, in der Datenbank
    bleibt der vollstaendige Verlauf. So wachsen die Anfragen nicht unbegrenzt,
    ohne dass etwas verloren geht.
    """

    def __init__(self, db: Database, session_id: str, window: int = 20,
                 clock=time.time) -> None:
        self.db = db
        self.session_id = session_id
        self.window = window
        self._clock = clock

    def add(self, role: str, content: str) -> None:
        self.db.execute(
            "INSERT INTO conversation_turns (session_id, role, content, created_at)"
            " VALUES (?,?,?,?)",
            (self.session_id, role, content, self._clock()),
        )

    def recent(self, limit: int | None = None) -> list[Turn]:
        """Die letzten Beitraege in zeitlicher Reihenfolge."""
        rows = self.db.query(
            "SELECT role, content, created_at FROM conversation_turns"
            " WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (self.session_id, limit or self.window),
        )
        return [Turn(r["role"], r["content"], r["created_at"]) for r in reversed(rows)]

    def as_messages(self) -> list[dict[str, str]]:
        """Fenster im Format des Sprachmodells."""
        return [{"role": t.role, "content": t.content} for t in self.recent()]

    def clear(self) -> None:
        """Beendet das Gespraech. Der Verlauf bleibt, das Fenster ist leer."""
        self.db.execute("DELETE FROM conversation_turns WHERE session_id = ?",
                        (self.session_id,))


class LongTermMemory:
    """Dauerhaft relevante Fakten, Praeferenzen und Regeln."""

    def __init__(self, db: Database, clock=time.time) -> None:
        self.db = db
        self._clock = clock

    def remember(self, subject: str, predicate: str, value: str, *,
                 kind: str = "fact", confidence: float = 1.0,
                 source: str | None = None, force: bool = False) -> Fact:
        """Legt einen Fakt ab.

        Gibt es zum selben ``subject``/``predicate`` schon einen anderen Wert,
        wird ``Contradiction`` geworfen -- es sei denn ``force=True``, dann
        ersetzt der neue Wert den alten und der alte wird als ueberholt
        verkettet (nicht geloescht).
        """
        existing = self.lookup(subject, predicate)
        if existing and existing.value != value:
            if not force:
                raise Contradiction(existing, value)
            fact = self._insert(subject, predicate, value, kind, confidence, source)
            self.db.execute("UPDATE facts SET superseded_by = ? WHERE id = ?",
                            (fact.id, existing.id))
            return fact
        if existing:
            return existing
        return self._insert(subject, predicate, value, kind, confidence, source)

    def _insert(self, subject, predicate, value, kind, confidence, source) -> Fact:
        cursor = self.db.execute(
            "INSERT INTO facts (subject, predicate, value, kind, confidence, source,"
            " created_at) VALUES (?,?,?,?,?,?,?)",
            (subject, predicate, value, kind, confidence, source, self._clock()),
        )
        return self.get(int(cursor.lastrowid))

    def get(self, fact_id: int) -> Fact:
        row = self.db.query_one("SELECT * FROM facts WHERE id = ?", (fact_id,))
        if row is None:
            raise KeyError(f"Fakt {fact_id} gibt es nicht.")
        return _row_to_fact(row)

    def lookup(self, subject: str, predicate: str) -> Fact | None:
        """Der aktuell gueltige Wert -- ueberholte Eintraege bleiben aussen vor."""
        row = self.db.query_one(
            "SELECT * FROM facts WHERE subject = ? AND predicate = ?"
            " AND superseded_by IS NULL ORDER BY id DESC LIMIT 1",
            (subject, predicate),
        )
        return _row_to_fact(row) if row else None

    def about(self, subject: str) -> list[Fact]:
        return [_row_to_fact(r) for r in self.db.query(
            "SELECT * FROM facts WHERE subject = ? AND superseded_by IS NULL ORDER BY id",
            (subject,))]

    def all(self, *, kind: str | None = None) -> list[Fact]:
        if kind:
            rows = self.db.query(
                "SELECT * FROM facts WHERE kind = ? AND superseded_by IS NULL ORDER BY id",
                (kind,))
        else:
            rows = self.db.query(
                "SELECT * FROM facts WHERE superseded_by IS NULL ORDER BY id")
        return [_row_to_fact(r) for r in rows]

    def history(self, subject: str, predicate: str) -> list[Fact]:
        """Auch die ueberholten Werte -- fuer die Rueckfrage, was einmal galt."""
        return [_row_to_fact(r) for r in self.db.query(
            "SELECT * FROM facts WHERE subject = ? AND predicate = ? ORDER BY id",
            (subject, predicate))]

    def forget(self, fact_id: int) -> None:
        """Loescht endgueltig. Fuer 'vergiss, dass ...'."""
        self.db.execute("DELETE FROM facts WHERE id = ?", (fact_id,))

    def correct(self, fact_id: int, value: str) -> Fact:
        fact = self.get(fact_id)
        return self.remember(fact.subject, fact.predicate, value,
                             kind=fact.kind, source=fact.source, force=True)

    def context_block(self, limit: int = 40) -> str:
        """Die Fakten als kurzer Text fuer die Systemanweisung.

        Damit muss nicht der ganze Gespraechsverlauf in den Kontext geladen
        werden, um zu wissen, was gilt.
        """
        facts = self.all()[:limit]
        if not facts:
            return ""
        return "\n".join(f"- {f.as_sentence()}" for f in facts)


def _row_to_fact(row) -> Fact:
    return Fact(
        id=row["id"], subject=row["subject"], predicate=row["predicate"],
        value=row["value"], kind=row["kind"], confidence=row["confidence"],
        source=row["source"], created_at=row["created_at"],
    )


class KnowledgeStore:
    """Dokumente und Notizen mit Stichwortsuche (SQLite FTS5)."""

    def __init__(self, db: Database, clock=time.time) -> None:
        self.db = db
        self._clock = clock

    def add(self, title: str, content: str, *, source: str | None = None,
            kind: str = "note") -> int:
        now = self._clock()
        cursor = self.db.execute(
            "INSERT INTO knowledge (title, source, kind, content, created_at, updated_at)"
            " VALUES (?,?,?,?,?,?)",
            (title, source, kind, content, now, now),
        )
        return int(cursor.lastrowid)

    def get(self, doc_id: int) -> dict | None:
        row = self.db.query_one("SELECT * FROM knowledge WHERE id = ?", (doc_id,))
        return dict(row) if row else None

    def update(self, doc_id: int, content: str) -> None:
        self.db.execute("UPDATE knowledge SET content = ?, updated_at = ? WHERE id = ?",
                        (content, self._clock(), doc_id))

    def delete(self, doc_id: int) -> None:
        self.db.execute("DELETE FROM knowledge WHERE id = ?", (doc_id,))

    def search(self, query: str, limit: int = 5) -> list[dict]:
        """Stichwortsuche. Leere oder nur aus Sonderzeichen bestehende Anfragen
        ergeben keine Treffer, statt die FTS-Syntax zu verletzen."""
        begriffe = [w for w in _tokenize(query) if w]
        if not begriffe:
            return []
        # Alle Begriffe als Praefixsuche, mit OR verbunden: robuster gegenueber
        # deutschen Beugungsformen als eine exakte Phrase.
        match = " OR ".join(f'"{w}"*' for w in begriffe)
        rows = self.db.query(
            "SELECT k.id, k.title, k.kind, k.source,"
            " snippet(knowledge_fts, 1, '[', ']', ' … ', 12) AS auszug,"
            " bm25(knowledge_fts) AS rang"
            " FROM knowledge_fts JOIN knowledge k ON k.id = knowledge_fts.rowid"
            " WHERE knowledge_fts MATCH ? ORDER BY rang LIMIT ?",
            (match, limit),
        )
        return [dict(r) for r in rows]


def _tokenize(text: str) -> list[str]:
    return ["".join(c for c in w if c.isalnum()) for w in text.split()]
