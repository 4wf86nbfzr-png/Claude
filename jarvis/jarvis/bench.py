"""Messung: wie schnell und wie teuer ist JARVIS auf diesem Rechner.

Gemessen wird, was sich ohne Mitwirkung messen laesst. Was Audio braucht
(Mikrofon, echte Erkennungsdauer), ist hier nur mit einer erzeugten Tondatei
moeglich -- das misst die Rechenzeit von Whisper, nicht die Reaktionszeit im
Gespraech. Der Unterschied steht in der Ausgabe.

Aufruf: ``jarvis bench``

Alle Werte sind Messwerte dieses Laufs, keine Schaetzungen. Was nicht gemessen
werden konnte, erscheint als ``--`` mit Grund.
"""

from __future__ import annotations

import array
import math
import os
import statistics
import time
from dataclasses import dataclass, field

from .config import Config
from .logging_setup import get_logger

log = get_logger("bench")


@dataclass(slots=True)
class Messung:
    name: str
    werte: list[float] = field(default_factory=list)
    einheit: str = "ms"
    grund: str | None = None      # falls nicht messbar
    hinweis: str = ""

    @property
    def messbar(self) -> bool:
        return self.grund is None and bool(self.werte)

    def zeile(self) -> str:
        if not self.messbar:
            return f"  {self.name:<34} --        {self.grund or 'keine Werte'}"
        median = statistics.median(self.werte)
        if len(self.werte) > 1:
            spanne = f"{min(self.werte):.0f}–{max(self.werte):.0f}"
            wert = f"{median:>7.0f} {self.einheit}  (n={len(self.werte)}, {spanne})"
        else:
            wert = f"{median:>7.0f} {self.einheit}"
        return f"  {self.name:<34} {wert}" + (f"  {self.hinweis}" if self.hinweis else "")


def _ton(sekunden: float, sample_rate: int = 16000) -> bytes:
    """Erzeugt gleichmaessige Toene -- kein Sprachersatz, aber die richtige
    Datenmenge fuer eine Laufzeitmessung."""
    anzahl = int(sekunden * sample_rate)
    werte = array.array("h", [
        int(6000 * math.sin(2 * math.pi * 180 * i / sample_rate)
            * (0.6 + 0.4 * math.sin(2 * math.pi * 3 * i / sample_rate)))
        for i in range(anzahl)
    ])
    return werte.tobytes()


def _speicher_mb() -> float | None:
    """Belegter Arbeitsspeicher dieses Prozesses, wenn abfragbar."""
    try:
        import resource  # noqa: PLC0415
    except ImportError:
        return None
    nutzung = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # Linux liefert Kilobyte, macOS Byte.
    import platform  # noqa: PLC0415
    teiler = 1024 * 1024 if platform.system() == "Darwin" else 1024
    return nutzung / teiler


# -- Einzelmessungen ----------------------------------------------------
def messe_gedaechtnis(cfg: Config, runden: int = 200) -> list[Messung]:
    from .memory.db import Database
    from .memory.store import KnowledgeStore, LongTermMemory

    schreiben = Messung("Gedaechtnis: Fakt speichern", einheit="µs")
    lesen = Messung("Gedaechtnis: Fakt abfragen", einheit="µs")
    suchen = Messung("Wissenssuche (1000 Notizen)", einheit="µs")

    with Database() as db:
        ltm = LongTermMemory(db)
        for i in range(runden):
            begin = time.perf_counter()
            ltm.remember(f"Thema{i}", "Eigenschaft", f"Wert{i}")
            schreiben.werte.append((time.perf_counter() - begin) * 1e6)
        for i in range(runden):
            begin = time.perf_counter()
            ltm.lookup(f"Thema{i}", "Eigenschaft")
            lesen.werte.append((time.perf_counter() - begin) * 1e6)

        ks = KnowledgeStore(db)
        for i in range(1000):
            ks.add(f"Notiz {i}",
                   f"Einsatz {i}: Sicherheit, Gastro, Logistik, Dresscode schwarz")
        for _ in range(50):
            begin = time.perf_counter()
            ks.search("Dresscode")
            suchen.werte.append((time.perf_counter() - begin) * 1e6)

    return [schreiben, lesen, suchen]


def messe_zerlegung(cfg: Config) -> list[Messung]:
    """Wie teuer ist die Audioverarbeitung je Block?

    Das laeuft auf jedem Block -- bei 30 ms Bloecken also 33-mal je Sekunde,
    dauerhaft. Wenn das zu teuer ist, ist alles andere egal.
    """
    from .speech.vad import SegmenterConfig, UtteranceSegmenter, rms

    block = _ton(0.03)
    pegel = Messung("Pegelberechnung je Block", einheit="µs")
    for _ in range(500):
        begin = time.perf_counter()
        rms(block)
        pegel.werte.append((time.perf_counter() - begin) * 1e6)

    anteil = statistics.median(pegel.werte) / 30_000 * 100
    pegel.hinweis = f"= {anteil:.2f} % eines 30-ms-Blocks"

    zerlegung = Messung("Zerlegung je Block", einheit="µs")
    s = UtteranceSegmenter(SegmenterConfig())
    for _ in range(500):
        begin = time.perf_counter()
        s.feed(block)
        zerlegung.werte.append((time.perf_counter() - begin) * 1e6)
    return [pegel, zerlegung]


def messe_abschnitte(cfg: Config) -> list[Messung]:
    from .speech.chunking import SentenceBuffer

    text = ("Moin Noah, fuer Halle 45 am Freitag sind drei Leute fuer die "
            "Sicherheit eingeteilt und acht fuer die Gastro. Der Dresscode "
            "ist schwarz, das steht so im Plan. Soll ich das Angebot "
            "zusammenstellen? ") * 5
    messung = Messung("Abschnittsbildung (1,2 kB Text)", einheit="µs")
    for _ in range(200):
        b = SentenceBuffer()
        begin = time.perf_counter()
        for i in range(0, len(text), 8):
            b.feed(text[i:i + 8])
        b.flush()
        messung.werte.append((time.perf_counter() - begin) * 1e6)
    return [messung]


def messe_stt(cfg: Config, runden: int = 3) -> list[Messung]:
    """Rechenzeit von whisper.cpp fuer drei Sekunden Audio."""
    from .speech.stt import STTError, WhisperCppSTT

    messung = Messung("Whisper: 3 s Audio", einheit="ms")
    engine = WhisperCppSTT(cfg.stt)
    ok, grund = engine.available()
    if not ok:
        messung.grund = grund
        return [messung]

    audio = _ton(3.0)
    for runde in range(runden):
        begin = time.perf_counter()
        try:
            engine.transcribe(audio, cfg.audio.sample_rate)
        except STTError as exc:
            messung.grund = str(exc)[:70]
            return [messung]
        dauer = (time.perf_counter() - begin) * 1000
        # Der erste Lauf laedt das Modell -- das verzerrt den Median.
        if runde == 0:
            messung.hinweis = f"erster Lauf {dauer:.0f} ms (Modell laden)"
            continue
        messung.werte.append(dauer)
    if messung.werte:
        faktor = statistics.median(messung.werte) / 3000
        messung.hinweis += f" | {faktor:.2f}× Echtzeit" if messung.hinweis \
            else f"{faktor:.2f}× Echtzeit"
    return [messung]


def messe_llm(cfg: Config, runden: int = 3) -> list[Messung]:
    """Zeit bis zum ersten Wort und bis zur vollstaendigen Antwort.

    Die Zeit bis zum ersten Wort ist die wichtigere Zahl: sie entscheidet,
    wie schnell JARVIS zu sprechen beginnt.
    """
    from .llm.client import LLMError, OllamaClient

    erstes = Messung("Modell: bis zum ersten Wort", einheit="ms")
    ganz = Messung("Modell: vollstaendige Antwort", einheit="ms")
    tempo = Messung("Modell: Durchsatz", einheit="Z/s")

    if cfg.llm.runtime == "none":
        for m in (erstes, ganz, tempo):
            m.grund = "kein Sprachmodell konfiguriert"
        return [erstes, ganz, tempo]

    client = OllamaClient(cfg.llm)
    ok, grund = client.health()
    if not ok:
        for m in (erstes, ganz, tempo):
            m.grund = grund[:70]
        return [erstes, ganz, tempo]

    fragen = [
        "Antworte in zwei Saetzen: was ist beim Bewachen einer Messe wichtig?",
        "Nenne in zwei Saetzen, worauf es bei Gastro-Personal ankommt.",
        "Fasse in zwei Saetzen zusammen, was ein Dresscode regelt.",
    ]
    for i in range(runden):
        nachrichten = [{"role": "user", "content": fragen[i % len(fragen)]}]
        begin = time.perf_counter()
        erstes_wort: float | None = None
        zeichen = 0
        try:
            for chunk in client.chat(nachrichten):
                if chunk.text:
                    if erstes_wort is None:
                        erstes_wort = (time.perf_counter() - begin) * 1000
                    zeichen += len(chunk.text)
        except LLMError as exc:
            for m in (erstes, ganz, tempo):
                if not m.werte:
                    m.grund = str(exc)[:70]
            return [erstes, ganz, tempo]
        gesamt = (time.perf_counter() - begin) * 1000
        if erstes_wort is not None:
            erstes.werte.append(erstes_wort)
        ganz.werte.append(gesamt)
        if gesamt > 0:
            tempo.werte.append(zeichen / (gesamt / 1000))
    return [erstes, ganz, tempo]


def messe_tts(cfg: Config) -> list[Messung]:
    """Wie lange braucht die Sprachausgabe bis zum Ton?

    Gemessen wird bis zum Ende der Wiedergabe -- ohne Audioausgabe ist das
    nicht trennbar, und ohne Lautsprecher gar nicht messbar.
    """
    from .speech.tts import TTSError, build_engine

    messung = Messung("Sprachausgabe: ein Satz", einheit="ms")
    engine = build_engine(cfg.tts)
    if engine.name == "none":
        messung.grund = "keine Sprachausgabe verfuegbar"
        return [messung]
    ok, grund = engine.available()
    if not ok:
        messung.grund = grund[:70]
        return [messung]

    import threading
    satz = "Fuer Halle 45 sind am Freitag drei Leute eingeteilt."
    for _ in range(2):
        begin = time.perf_counter()
        try:
            engine.speak(satz, threading.Event())
        except TTSError as exc:
            messung.grund = str(exc)[:70]
            return [messung]
        messung.werte.append((time.perf_counter() - begin) * 1000)
    messung.hinweis = "einschliesslich Wiedergabe"
    return [messung]


def messe_werkzeuge(cfg: Config) -> list[Messung]:
    from .agent import Agent
    from .llm.client import NullLLM
    from .memory.db import Database
    from .tools.builtin import build_registry

    messung = Messung("Werkzeugverzeichnis aufbauen", einheit="µs")
    with Database() as db:
        for _ in range(50):
            begin = time.perf_counter()
            agent = Agent(cfg, db, NullLLM())
            build_registry(cfg, agent=agent)
            messung.werte.append((time.perf_counter() - begin) * 1e6)
    return [messung]


def run(cfg: Config | None = None, *, mit_modell: bool = True,
        mit_audio: bool = True) -> str:
    """Fuehrt alle Messungen aus und gibt den Bericht zurueck."""
    cfg = cfg or Config()
    vorher = _speicher_mb()
    begin = time.perf_counter()

    gruppen: list[tuple[str, list[Messung]]] = [
        ("Gedaechtnis", messe_gedaechtnis(cfg)),
        ("Audioverarbeitung (laeuft dauerhaft)", messe_zerlegung(cfg)),
        ("Sprachausgabe vorbereiten", messe_abschnitte(cfg)),
        ("Werkzeuge", messe_werkzeuge(cfg)),
    ]
    if mit_audio:
        gruppen.append(("Spracherkennung", messe_stt(cfg)))
        gruppen.append(("Sprachausgabe", messe_tts(cfg)))
    if mit_modell:
        gruppen.append(("Sprachmodell", messe_llm(cfg)))

    nachher = _speicher_mb()
    dauer = time.perf_counter() - begin

    zeilen = ["JARVIS -- Messung", "=" * 62]
    for titel, messungen in gruppen:
        zeilen.append(f"\n{titel}")
        zeilen.extend(m.zeile() for m in messungen)

    zeilen.append("\nRessourcen")
    if vorher is not None and nachher is not None:
        zeilen.append(f"  {'Arbeitsspeicher (Spitze)':<34} {nachher:>7.0f} MB"
                      f"  (+{nachher - vorher:.0f} MB durch die Messung)")
    else:
        zeilen.append(f"  {'Arbeitsspeicher':<34} --        nicht abfragbar")
    try:
        last = os.getloadavg()[0]
        zeilen.append(f"  {'Systemlast (1 min)':<34} {last:>7.2f}")
    except (OSError, AttributeError):
        pass
    zeilen.append(f"  {'Dauer der Messung':<34} {dauer:>7.1f} s")

    zeilen.append("\n" + "=" * 62)
    zeilen.append(
        "Hinweis: Die Spracherkennung wurde mit einem erzeugten Ton gemessen,\n"
        "nicht mit Sprache. Das misst die Rechenzeit von Whisper, nicht die\n"
        "Reaktionszeit im Gespraech -- dazu kommen Aufnahme, Satzende-Erkennung\n"
        "und die Zeit bis zum ersten Wort des Modells.\n\n"
        "Die Zeit vom Ende deiner Aeusserung bis zum ersten gesprochenen Wort\n"
        "misst JARVIS im Betrieb selbst; sie steht im Dashboard und unter\n"
        "'letzte_latenz' in /api/status.")
    return "\n".join(zeilen)
