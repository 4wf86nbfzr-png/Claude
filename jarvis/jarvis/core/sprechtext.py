"""Geschriebenes in Gesprochenes uebersetzen.

Eine Stimme klingt nicht deshalb nach Maschine, weil sie schlecht ist,
sondern weil sie vorliest, was fuer die Augen geschrieben wurde. "Termin
am 5.11. um 8:30 Uhr, ca. 2 Std." liest jede Stimme als Zeichenfolge. Ein
Mensch sagt: "Termin am fuenften November um halb neun, ungefaehr zwei
Stunden."

Hier wird genau das gemacht: Uhrzeiten, Datumsangaben, Abkuerzungen,
Einheiten und Aufzaehlungszeichen werden ausgeschrieben, Formatierung und
Links fliegen raus. Danach geht der Text an die Stimme.

Dazu kommt ``in_stuecke``: die Antwort wird in Saetze zerlegt, damit die
erste Haelfte schon klingt, waehrend die zweite noch erzeugt wird.
"""

from __future__ import annotations

import re

# Diese Woerter gehen an die Stimme -- hier stehen deshalb echte Umlaute.
# "fuenf" wuerde vorgelesen wie geschrieben.
EINER = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben",
         "acht", "neun", "zehn", "elf", "zwölf", "dreizehn", "vierzehn",
         "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"]
ZEHNER = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig",
          "siebzig", "achtzig", "neunzig"]
MONATE = ["", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
          "August", "September", "Oktober", "November", "Dezember"]
#: Ordnungszahlen, wie man sie in "am fünften November" spricht.
ORDNUNG = ["", "ersten", "zweiten", "dritten", "vierten", "fünften", "sechsten",
           "siebten", "achten", "neunten", "zehnten", "elften", "zwölften",
           "dreizehnten", "vierzehnten", "fünfzehnten", "sechzehnten",
           "siebzehnten", "achtzehnten", "neunzehnten", "zwanzigsten",
           "einundzwanzigsten", "zweiundzwanzigsten", "dreiundzwanzigsten",
           "vierundzwanzigsten", "fünfundzwanzigsten", "sechsundzwanzigsten",
           "siebenundzwanzigsten", "achtundzwanzigsten", "neunundzwanzigsten",
           "dreißigsten", "einunddreißigsten"]

WOCHENTAGE = {
    "mo": "Montag", "di": "Dienstag", "mi": "Mittwoch", "do": "Donnerstag",
    "fr": "Freitag", "sa": "Samstag", "so": "Sonntag",
}

#: Abkuerzungen, die ausgesprochen anders lauten als geschrieben.
ABKUERZUNGEN: list[tuple[str, str]] = [
    (r"\bz\.\s?B\.", "zum Beispiel"),
    (r"\bd\.\s?h\.", "das heißt"),
    (r"\bu\.\s?a\.", "unter anderem"),
    (r"\bi\.\s?d\.\s?R\.", "in der Regel"),
    (r"\bbzw\.", "beziehungsweise"),
    (r"\bca\.", "ungefähr"),
    (r"\bevtl\.", "eventuell"),
    (r"\bggf\.", "gegebenenfalls"),
    (r"\binkl\.", "inklusive"),
    (r"\bexkl\.", "exklusive"),
    (r"\busw\.", "und so weiter"),
    (r"\bvgl\.", "vergleiche"),
    (r"\bNr\.\s*", "Nummer "),
    (r"\bAbs\.", "Absatz"),
    (r"\bmax\.", "maximal"),
    (r"\bmin\.(?=\s)", "mindestens"),
    (r"\bStd\.", "Stunden"),
    (r"\bMin\.", "Minuten"),
    (r"\bMitarb\.", "Mitarbeiter"),
    (r"\bMo\.-\s?Fr\.", "montags bis freitags"),
]

EINHEITEN: list[tuple[str, str]] = [
    (r"(\d)\s*°\s*C\b", r"\1 Grad"),
    (r"(\d)\s*%", r"\1 Prozent"),
    (r"(\d)\s*€", r"\1 Euro"),
    (r"€\s*(\d)", r"\1 Euro"),
    (r"(\d)\s*km/h\b", r"\1 Kilometer pro Stunde"),
    (r"(\d)\s*km\b", r"\1 Kilometer"),
    (r"(\d)\s*kg\b", r"\1 Kilo"),
    (r"(\d)\s*h\b", r"\1 Stunden"),
    (r"&", " und "),
]

#: Emoji und Symbole, die niemand vorgelesen hoeren will.
SYMBOLE = re.compile(
    "[\U0001F000-\U0001FAFF←-⇿⌀-➿️•·]+"
)
AKTIONSMARKE = re.compile(
    r"\[\s*(?:AKTION|ACTION)\s*:\s*(\w+)\s*\]\s*([^\n\[]*)", re.IGNORECASE
)


def zahlwort(zahl: int) -> str:
    """Deutsche Zahlwoerter bis 999 -- mehr braucht eine Uhrzeit nicht."""
    if zahl < 0:
        return f"minus {zahlwort(-zahl)}"
    if zahl < 20:
        return EINER[zahl]
    if zahl < 100:
        zehner, einer = divmod(zahl, 10)
        if not einer:
            return ZEHNER[zehner]
        vorne = "ein" if einer == 1 else EINER[einer]
        return f"{vorne}und{ZEHNER[zehner]}"
    hunderter, rest = divmod(zahl, 100)
    vorne = "einhundert" if hunderter == 1 else f"{EINER[hunderter]}hundert"
    return vorne if not rest else f"{vorne}{zahlwort(rest)}"


def _uhrzeit(treffer: re.Match[str]) -> str:
    stunde, minute = int(treffer.group(1)), int(treffer.group(2))
    if not 0 <= stunde <= 23 or not 0 <= minute <= 59:
        return treffer.group(0)
    if minute == 0:
        return f"{zahlwort(stunde)} Uhr"
    # "halb neun" und "viertel vor" nur am Vormittag: "viertel vor achtzehn"
    # sagt niemand, "siebzehn Uhr fünfundvierzig" schon.
    if stunde < 12:
        if minute == 30:
            return f"halb {zahlwort(stunde + 1 if stunde < 11 else 12)}"
        if minute == 15:
            return f"viertel nach {zahlwort(stunde)}"
        if minute == 45:
            return f"viertel vor {zahlwort(stunde + 1 if stunde < 11 else 12)}"
    return f"{zahlwort(stunde)} Uhr {zahlwort(minute)}"


def _datum(treffer: re.Match[str]) -> str:
    tag, monat = int(treffer.group(1)), int(treffer.group(2))
    if not 1 <= tag <= 31 or not 1 <= monat <= 12:
        return treffer.group(0)
    jahr = treffer.group(3)
    gesprochen = f"{ORDNUNG[tag]} {MONATE[monat]}"
    if jahr and len(jahr) == 4:
        gesprochen += f" {jahr}"
    return gesprochen


def fuer_stimme(text: str) -> str:
    """Macht aus geschriebenem Text etwas, das man so sagen wuerde."""
    ohne = AKTIONSMARKE.sub(" ", text or "")

    # Nummern ausschreiben, solange die Raute noch da ist.
    ohne = re.sub(r"#(\d+)", lambda t: f"Nummer {zahlwort(int(t.group(1)))}", ohne)
    # Formatierung und Listenzeichen.
    ohne = re.sub(r"[*_`#]+", "", ohne)
    ohne = re.sub(r"^[ \t]*[-•]\s*", "", ohne, flags=re.MULTILINE)
    ohne = re.sub(r"\bhttps?://\S+", "die verlinkte Seite", ohne)
    ohne = re.sub(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b", "die Adresse", ohne)
    ohne = SYMBOLE.sub(" ", ohne)

    for muster, ersatz in ABKUERZUNGEN:
        ohne = re.sub(muster, ersatz, ohne)
    # Wochentage: "Mo 9:00" -> "Montag 9:00"
    ohne = re.sub(
        r"\b(Mo|Di|Mi|Do|Fr|Sa|So)\.(?=\s|$)",
        lambda t: WOCHENTAGE[t.group(1).lower()], ohne,
    )
    # Datum vor der Uhrzeit, sonst frisst die Uhrzeit "5.11."
    ohne = re.sub(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?", _datum, ohne)
    # Uhrzeit mit und ohne "Uhr" dahinter.
    ohne = re.sub(r"\b(\d{1,2}):(\d{2})(?:\s*Uhr)?", _uhrzeit, ohne)

    for muster, ersatz in EINHEITEN:
        ohne = re.sub(muster, ersatz, ohne)

    # Kleine Zahlen ausschreiben. Groessere (Jahreszahlen, Betraege) bleiben
    # stehen -- die liest die Stimme von sich aus richtig.
    ohne = re.sub(
        r"(?<![\w.,:/-])(\d{1,2})(?![\w.,:/-])",
        lambda t: zahlwort(int(t.group(1))) if int(t.group(1)) <= 12 else t.group(1),
        ohne,
    )

    ohne = re.sub(r"\s+([,.!?;:])", r"\1", ohne)
    ohne = re.sub(r"[ \t]+", " ", ohne)
    ohne = re.sub(r"\n{2,}", "\n", ohne)
    return ohne.strip()


#: Satzende, aber nicht bei "z.B." oder "Dr." -- die sind oben schon weg.
SATZENDE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ„\d])|\n+")


def in_stuecke(text: str, *, max_zeichen: int = 220) -> list[str]:
    """Zerlegt den Text in sprechbare Haeppchen.

    Das erste Stueck soll kurz sein: es entscheidet, wie lange es dauert,
    bis ueberhaupt etwas zu hoeren ist.
    """
    sauber = " ".join((text or "").split("\n"))
    sauber = " ".join(sauber.split())
    if not sauber:
        return []
    saetze = [s.strip() for s in SATZENDE.split(text or "") if s.strip()]
    if not saetze:
        saetze = [sauber]

    stuecke: list[str] = []
    aktuell = ""
    grenze = 110          # erstes Stueck bewusst klein
    for satz in saetze:
        satz = " ".join(satz.split())
        while len(satz) > max_zeichen:
            # Ein ueberlanger Satz wird am letzten Komma vor der Grenze geteilt.
            schnitt = satz.rfind(",", 0, max_zeichen)
            if schnitt < 40:
                schnitt = satz.rfind(" ", 0, max_zeichen)
            if schnitt < 40:
                schnitt = max_zeichen
            stuecke.append(satz[:schnitt].strip(" ,"))
            satz = satz[schnitt:].strip(" ,")
            grenze = max_zeichen
        if not aktuell:
            aktuell = satz
        elif len(aktuell) + len(satz) + 1 <= grenze:
            aktuell = f"{aktuell} {satz}"
        else:
            stuecke.append(aktuell)
            aktuell = satz
            grenze = max_zeichen
    if aktuell:
        stuecke.append(aktuell)
    return [s for s in stuecke if s]
