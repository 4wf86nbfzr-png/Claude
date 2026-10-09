"""Zeitrechnung und deutsche Zeitangaben.

Intern wird alles in UTC gespeichert (siehe ``db.database.iso``), angezeigt
und eingegeben wird in der konfigurierten Zeitzone. ``parse_when`` versteht
sowohl ISO-Zeitstempel (die das Sprachmodell liefert) als auch die
Formulierungen, die man tatsaechlich tippt: "morgen 8:30", "in 10 Minuten",
"naechsten Montag", "uebermorgen abend".

Wiederholungen sind absichtlich schlicht gehalten statt eines vollen
RRULE-Parsers -- "taeglich", "wochentags", "woechentlich:mo", "monatlich:5"
deckt den Alltag ab und bleibt nachvollziehbar.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

WEEKDAYS = {
    "montag": 0, "mo": 0, "dienstag": 1, "di": 1, "mittwoch": 2, "mi": 2,
    "donnerstag": 3, "do": 3, "freitag": 4, "fr": 4, "samstag": 5, "sa": 5,
    "sonnabend": 5, "sonntag": 6, "so": 6,
}

#: Tageszeiten ohne genaue Uhrzeit. Bewusst konservativ: Jarvis fragt bei
#: diesen Angaben nach, wenn die Erinnerung wichtig ist.
DAYPARTS = {
    "frueh": time(7, 0), "früh": time(7, 0), "morgen frueh": time(7, 0),
    "morgens": time(8, 0), "vormittag": time(10, 0), "vormittags": time(10, 0),
    "mittag": time(12, 0), "mittags": time(12, 0),
    "nachmittag": time(15, 0), "nachmittags": time(15, 0),
    "abend": time(19, 0), "abends": time(19, 0),
    "nacht": time(22, 0), "nachts": time(22, 0),
}

MONTHS = {
    "januar": 1, "februar": 2, "maerz": 3, "märz": 3, "april": 4, "mai": 5,
    "juni": 6, "juli": 7, "august": 8, "september": 9, "oktober": 10,
    "november": 11, "dezember": 12,
}

_DEFAULT_TIME = time(9, 0)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_local(moment: datetime, tz: ZoneInfo) -> datetime:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(tz)


def to_utc(moment: datetime, tz: ZoneInfo) -> datetime:
    """Interpretiert eine naive Zeit als Ortszeit und rechnet nach UTC."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=tz)
    return moment.astimezone(timezone.utc)


def format_local(moment: datetime | None, tz: ZoneInfo, *, with_year: bool = False) -> str:
    """Kurze deutsche Darstellung, relativ wo es hilft ("heute 14:00")."""
    if moment is None:
        return "ohne Termin"
    local = to_local(moment, tz)
    today = datetime.now(tz).date()
    delta_days = (local.date() - today).days
    clock = local.strftime("%H:%M")
    if delta_days == 0:
        return f"heute {clock}"
    if delta_days == 1:
        return f"morgen {clock}"
    if delta_days == -1:
        return f"gestern {clock}"
    if 2 <= delta_days <= 6:
        names = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
        return f"{names[local.weekday()]} {clock}"
    pattern = "%d.%m.%Y %H:%M" if with_year or delta_days > 300 or delta_days < -300 else "%d.%m. %H:%M"
    return local.strftime(pattern)


_DATE_LIKE = re.compile(r"\b\d{1,2}\.\s*\d{1,2}\.(?:\s*\d{2,4})?")


def _parse_clock(text: str) -> time | None:
    # "5.11." ist ein Datum, keine Uhrzeit -- Datumsangaben vorher entfernen,
    # sonst liest der Punkt-Trenner darin eine Uhrzeit 5:11.
    text = _DATE_LIKE.sub(" ", text)
    match = re.search(r"\b(\d{1,2})[:.](\d{2})\b", text)
    if match:
        hour, minute = int(match.group(1)), int(match.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return time(hour, minute)
    match = re.search(r"\b(?:um\s+)?(\d{1,2})\s*uhr\b", text)
    if match:
        hour = int(match.group(1))
        if 0 <= hour <= 23:
            return time(hour, 0)
    return None


def _parse_daypart(text: str) -> time | None:
    for word, value in DAYPARTS.items():
        if re.search(rf"\b{re.escape(word)}\b", text):
            return value
    return None


def parse_when(
    raw: str | datetime | None,
    tz: ZoneInfo,
    *,
    reference: datetime | None = None,
    default_time: time | None = None,
) -> datetime | None:
    """Wandelt eine Zeitangabe in einen UTC-Zeitstempel. ``None`` wenn unklar."""
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return to_utc(raw, tz)

    text = str(raw).strip().lower()
    if not text:
        return None

    ref_local = to_local(reference or now_utc(), tz)
    default_time = default_time or _DEFAULT_TIME

    # 1) ISO-Zeitstempel (das liefert das Sprachmodell)
    iso_candidate = text.replace("z", "+00:00") if text.endswith("z") else text
    try:
        parsed = datetime.fromisoformat(iso_candidate)
    except ValueError:
        parsed = None
    if parsed is not None:
        if parsed.tzinfo is None:
            # Nur-Datum ohne Uhrzeit bekommt die Standarduhrzeit.
            if parsed.time() == time(0, 0) and not re.search(r"\d{1,2}:\d{2}", text):
                parsed = parsed.replace(hour=default_time.hour, minute=default_time.minute)
            return to_utc(parsed, tz)
        return parsed.astimezone(timezone.utc)

    # 2) Relative Abstaende: "in 10 minuten", "in 2 stunden", "in 3 tagen"
    match = re.search(
        r"\bin\s+(?:(?:einer|einem|eine)\s+)?(\d+)?\s*"
        r"(minute|minuten|min|stunde|stunden|std|tag|tagen|woche|wochen|monat|monaten)\b",
        text,
    )
    if match:
        amount = int(match.group(1) or 1)
        unit = match.group(2)
        if unit.startswith("min"):
            delta = timedelta(minutes=amount)
        elif unit.startswith(("stunde", "std")):
            delta = timedelta(hours=amount)
        elif unit.startswith("tag"):
            delta = timedelta(days=amount)
        elif unit.startswith("woche"):
            delta = timedelta(weeks=amount)
        else:
            delta = timedelta(days=30 * amount)
        return to_utc(ref_local + delta, tz)
    if re.search(r"\bin\s+(?:einer|ner)\s+(?:halben\s+)?stunde\b", text):
        minutes = 30 if "halben" in text else 60
        return to_utc(ref_local + timedelta(minutes=minutes), tz)
    if re.search(r"\b(sofort|jetzt|gleich)\b", text):
        return to_utc(ref_local + timedelta(minutes=1), tz)

    # 3) Tagesbezug
    clock = _parse_clock(text)
    daypart = _parse_daypart(text)
    target_date: date | None = None

    if re.search(r"\buebermorgen|übermorgen\b", text):
        target_date = ref_local.date() + timedelta(days=2)
    elif re.search(r"\bmorgen\b", text):
        target_date = ref_local.date() + timedelta(days=1)
    elif re.search(r"\bheute\b", text):
        target_date = ref_local.date()
    elif re.search(r"\bgestern\b", text):
        target_date = ref_local.date() - timedelta(days=1)

    if target_date is None:
        # "naechsten montag", "am freitag", "jeden montag" -> naechstes Vorkommen
        weekday_match = re.search(
            r"\b(?:am|naechsten|nächsten|kommenden|jeden|diesen)?\s*"
            r"(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag)\b",
            text,
        )
        if weekday_match:
            wanted = WEEKDAYS[weekday_match.group(1)]
            ahead = (wanted - ref_local.weekday()) % 7
            explicit_next = bool(re.search(r"naechsten|nächsten|kommenden", text))
            if ahead == 0 and (explicit_next or (clock or daypart) is None):
                ahead = 7
            target_date = ref_local.date() + timedelta(days=ahead)

    if target_date is None:
        # "5.11.", "05.11.2026", "5. november"
        date_match = re.search(r"\b(\d{1,2})\.\s*(\d{1,2})\.(\d{2,4})?", text)
        if date_match:
            day, month = int(date_match.group(1)), int(date_match.group(2))
            year = int(date_match.group(3) or ref_local.year)
            if year < 100:
                year += 2000
            try:
                target_date = date(year, month, day)
            except ValueError:
                target_date = None
            if target_date and target_date < ref_local.date() and not date_match.group(3):
                target_date = target_date.replace(year=year + 1)
        else:
            month_match = re.search(r"\b(\d{1,2})\.?\s+(" + "|".join(MONTHS) + r")\b", text)
            if month_match:
                day = int(month_match.group(1))
                month = MONTHS[month_match.group(2)]
                year = ref_local.year
                try:
                    target_date = date(year, month, day)
                except ValueError:
                    target_date = None
                if target_date and target_date < ref_local.date():
                    target_date = target_date.replace(year=year + 1)

    if target_date is None and (clock or daypart):
        # Nur eine Uhrzeit: heute, wenn sie noch kommt, sonst morgen.
        chosen = clock or daypart
        candidate = datetime.combine(ref_local.date(), chosen)
        if candidate <= ref_local.replace(tzinfo=None):
            candidate += timedelta(days=1)
        return to_utc(candidate, tz)

    if target_date is None:
        return None

    chosen_time = clock or daypart or default_time
    return to_utc(datetime.combine(target_date, chosen_time), tz)


def is_vague_time(raw: str | None) -> bool:
    """True, wenn eine Angabe nur ungefaehr ist ("morgen frueh") -- dann lohnt eine Rueckfrage."""
    if not raw:
        return False
    text = str(raw).strip().lower()
    if _parse_clock(text):
        return False
    return _parse_daypart(text) is not None or bool(
        re.search(r"\b(morgen|heute|uebermorgen|übermorgen|demnaechst|demnächst|bald|irgendwann)\b", text)
    )


def parse_recurrence(raw: str | None) -> str:
    """Normiert eine Wiederholungsangabe auf das interne Kurzformat."""
    if not raw:
        return ""
    text = str(raw).strip().lower()
    if text in {"", "nein", "einmal", "einmalig", "keine", "none"}:
        return ""
    if text.startswith(("taeglich", "täglich", "jeden tag", "daily")):
        return "taeglich"
    if "wochentag" in text or "werktag" in text or text.startswith("weekdays"):
        return "wochentags"
    if text.startswith(("woechentlich", "wöchentlich", "weekly", "jede woche")):
        rest = text.split(":", 1)[1].strip() if ":" in text else ""
        key = WEEKDAYS.get(rest[:2]) if rest else None
        return f"woechentlich:{rest[:2]}" if key is not None else "woechentlich"
    for name, index in WEEKDAYS.items():
        if re.search(rf"\bjeden\s+{name}\b", text):
            short = ["mo", "di", "mi", "do", "fr", "sa", "so"][index]
            return f"woechentlich:{short}"
    if text.startswith(("monatlich", "monthly", "jeden monat")):
        match = re.search(r"(\d{1,2})", text)
        return f"monatlich:{match.group(1)}" if match else "monatlich"
    if text.startswith("jaehrlich") or text.startswith("jährlich"):
        return "jaehrlich"
    match = re.search(r"alle\s+(\d+)\s*(minuten|stunden|tage|wochen)", text)
    if match:
        return f"alle:{match.group(1)}:{match.group(2)[:3]}"
    return ""


def next_occurrence(recurrence: str, after: datetime, tz: ZoneInfo) -> datetime | None:
    """Naechster Termin einer Wiederholung nach ``after`` (UTC in, UTC out)."""
    if not recurrence:
        return None
    local = to_local(after, tz)
    kind, _, argument = recurrence.partition(":")

    if kind == "taeglich":
        return to_utc(local + timedelta(days=1), tz)
    if kind == "wochentags":
        candidate = local + timedelta(days=1)
        while candidate.weekday() >= 5:
            candidate += timedelta(days=1)
        return to_utc(candidate, tz)
    if kind == "woechentlich":
        if argument and argument in WEEKDAYS:
            wanted = WEEKDAYS[argument]
            ahead = (wanted - local.weekday()) % 7 or 7
            return to_utc(local + timedelta(days=ahead), tz)
        return to_utc(local + timedelta(days=7), tz)
    if kind == "monatlich":
        day = int(argument) if argument.isdigit() else local.day
        month = local.month + 1
        year = local.year + (1 if month > 12 else 0)
        month = 1 if month > 12 else month
        for attempt in range(4):  # 31. in kurzen Monaten nach vorne ziehen
            try:
                return to_utc(local.replace(year=year, month=month, day=day - attempt, tzinfo=None), tz)
            except ValueError:
                continue
        return None
    if kind == "jaehrlich":
        try:
            return to_utc(local.replace(year=local.year + 1, tzinfo=None), tz)
        except ValueError:
            return None
    if kind == "alle":
        parts = recurrence.split(":")
        if len(parts) == 3 and parts[1].isdigit():
            amount, unit = int(parts[1]), parts[2]
            delta = {
                "min": timedelta(minutes=amount),
                "stu": timedelta(hours=amount),
                "tag": timedelta(days=amount),
                "woc": timedelta(weeks=amount),
            }.get(unit)
            if delta:
                return to_utc(local + delta, tz)
    return None


def describe_recurrence(recurrence: str) -> str:
    if not recurrence:
        return "einmalig"
    kind, _, argument = recurrence.partition(":")
    names = {"mo": "Montag", "di": "Dienstag", "mi": "Mittwoch", "do": "Donnerstag",
             "fr": "Freitag", "sa": "Samstag", "so": "Sonntag"}
    if kind == "taeglich":
        return "taeglich"
    if kind == "wochentags":
        return "jeden Wochentag"
    if kind == "woechentlich":
        return f"jeden {names.get(argument, 'Woche')}" if argument else "woechentlich"
    if kind == "monatlich":
        return f"monatlich am {argument}." if argument else "monatlich"
    if kind == "jaehrlich":
        return "jaehrlich"
    if kind == "alle":
        parts = recurrence.split(":")
        if len(parts) == 3:
            units = {"min": "Minuten", "stu": "Stunden", "tag": "Tage", "woc": "Wochen"}
            return f"alle {parts[1]} {units.get(parts[2], parts[2])}"
    return recurrence


def in_quiet_hours(moment: datetime, tz: ZoneInfo, start: str, end: str) -> bool:
    """Ruhezeit, auch ueber Mitternacht hinweg ("22:00" bis "07:00")."""
    if not start or not end:
        return False
    try:
        start_t = time(*(int(x) for x in start.split(":")[:2]))
        end_t = time(*(int(x) for x in end.split(":")[:2]))
    except (ValueError, TypeError):
        return False
    local_time = to_local(moment, tz).time()
    if start_t <= end_t:
        return start_t <= local_time < end_t
    return local_time >= start_t or local_time < end_t
