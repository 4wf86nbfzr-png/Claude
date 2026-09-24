/* HST Planer – Fachlogik aus src/lib, gebuendelt fuer die Demo. */
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/lib/time.ts
  var MINUTES_PER_DAY = 24 * 60;
  function parseTimeToMinutes(input) {
    if (input == null) return null;
    if (typeof input === "number" && Number.isFinite(input)) {
      if (input >= 0 && input < 1) return Math.round(input * MINUTES_PER_DAY);
      if (Number.isInteger(input) && input >= 0 && input <= 2359) {
        const h = Math.floor(input / 100);
        const m2 = input % 100;
        if (h <= 24 && m2 <= 59) return h * 60 + m2;
      }
      return null;
    }
    if (input instanceof Date && !Number.isNaN(input.getTime())) {
      return input.getUTCHours() * 60 + input.getUTCMinutes();
    }
    if (typeof input !== "string") return null;
    const raw = input.trim().toLowerCase().replace(/uhr$/, "").trim();
    if (!raw) return null;
    const m = raw.match(/^(\d{1,2})\s*(?:[:.,]\s*(\d{1,2}))?(?:\s*[:.]\s*\d{1,2})?$/);
    if (m) {
      const h = Number(m[1]);
      const min = m[2] === void 0 ? 0 : Number(m[2]);
      if (h > 24 || min > 59) return null;
      if (h === 24 && min > 0) return null;
      return h * 60 + min;
    }
    const compact = raw.match(/^(\d{2})(\d{2})$/);
    if (compact) {
      const h = Number(compact[1]);
      const min = Number(compact[2]);
      if (h > 24 || min > 59) return null;
      return h * 60 + min;
    }
    return null;
  }
  function formatMinutes(minutes) {
    const normalized = (minutes % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function normalizeTime(input) {
    const minutes = parseTimeToMinutes(input);
    return minutes == null ? null : formatMinutes(minutes);
  }
  function shiftDuration(start, end, breakMinutes = 0, options = {}) {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (s == null || e == null) return null;
    let gross = e - s;
    if (gross < 0) gross += MINUTES_PER_DAY;
    if (gross === 0 && options.treatEqualAsFullDay) gross = MINUTES_PER_DAY;
    const pause = Number.isFinite(breakMinutes) ? Math.max(0, Math.round(breakMinutes)) : 0;
    return {
      grossMinutes: gross,
      netMinutes: Math.max(0, gross - pause),
      overnight: e < s
    };
  }
  function shiftMinutes(start, end, breakMinutes = 0) {
    return shiftDuration(start, end, breakMinutes)?.netMinutes ?? null;
  }
  function timeDiffMinutes(planned, actual) {
    const p = parseTimeToMinutes(planned);
    const a = parseTimeToMinutes(actual);
    if (p == null || a == null) return null;
    let diff = a - p;
    while (diff > MINUTES_PER_DAY / 2) diff -= MINUTES_PER_DAY;
    while (diff < -MINUTES_PER_DAY / 2) diff += MINUTES_PER_DAY;
    return diff;
  }
  function formatDiff(minutes) {
    if (minutes == null) return "\u2013";
    if (minutes === 0) return "0 Min";
    const sign = minutes < 0 ? "-" : "+";
    const abs = Math.abs(minutes);
    if (abs < 60) return `${sign}${abs} Min`;
    return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")} h`;
  }
  function minutesToHours(minutes) {
    return Math.round(minutes / 60 * 100) / 100;
  }
  function formatHours(minutes) {
    if (minutes == null) return "\u2013";
    const abs = Math.abs(minutes);
    const sign = minutes < 0 ? "-" : "";
    return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")} h`;
  }
  function toDateOnly(value) {
    const d = value instanceof Date ? value : new Date(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  var DATE_PATTERNS = [
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // 2026-10-15
    /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/,
    // 15.10.2026 / 15.10.26
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    // 15/10/2026 (europaeisch gelesen)
  ];
  var MONTHS = {
    januar: 1,
    jan: 1,
    februar: 2,
    feb: 2,
    maerz: 3,
    m\u00E4rz: 3,
    mrz: 3,
    mar: 3,
    april: 4,
    apr: 4,
    mai: 5,
    juni: 6,
    jun: 6,
    juli: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    oktober: 10,
    okt: 10,
    november: 11,
    nov: 11,
    dezember: 12,
    dez: 12
  };
  function parseGermanDate(input, reference = /* @__PURE__ */ new Date()) {
    if (input == null) return null;
    if (input instanceof Date && !Number.isNaN(input.getTime())) return toDateOnly(input);
    if (typeof input === "number" && Number.isFinite(input) && input > 2e4 && input < 8e4) {
      return new Date(Date.UTC(1899, 11, 30) + Math.round(input) * 864e5);
    }
    if (typeof input !== "string") return null;
    const raw = input.trim();
    if (!raw) return null;
    for (const pattern of DATE_PATTERNS) {
      const m = raw.match(pattern);
      if (!m) continue;
      const [a, b, c] = [m[1], m[2], m[3]];
      let year, month, day;
      if (pattern === DATE_PATTERNS[0]) {
        year = Number(a);
        month = Number(b);
        day = Number(c);
      } else {
        day = Number(a);
        month = Number(b);
        year = Number(c);
        if (year < 100) year += year < 70 ? 2e3 : 1900;
      }
      return buildDate(year, month, day);
    }
    const short = raw.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
    if (short) {
      const day = Number(short[1]);
      const month = Number(short[2]);
      return nextOccurrence(month, day, reference);
    }
    const named = raw.toLowerCase().match(/^(\d{1,2})\.?\s+([a-zäöüß]+)\.?(?:\s+(\d{4}))?$/);
    if (named) {
      const month = MONTHS[named[2]];
      if (month) {
        const day = Number(named[1]);
        return named[3] ? buildDate(Number(named[3]), month, day) : nextOccurrence(month, day, reference);
      }
    }
    const iso = new Date(raw);
    return Number.isNaN(iso.getTime()) ? null : toDateOnly(iso);
  }
  function buildDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return d;
  }
  function nextOccurrence(month, day, reference) {
    const today = toDateOnly(reference);
    const thisYear = buildDate(today.getUTCFullYear(), month, day);
    if (thisYear && thisYear.getTime() >= today.getTime() - 14 * 864e5) return thisYear;
    return buildDate(today.getUTCFullYear() + 1, month, day);
  }
  function formatDateDE(date) {
    if (!date) return "\u2013";
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "\u2013";
    return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
  }
  function isoDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  }
  var WEEKDAYS_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  function weekdayDE(date) {
    const d = date instanceof Date ? date : new Date(date);
    return WEEKDAYS_DE[d.getUTCDay()] ?? "";
  }

  // src/lib/match.ts
  var AUTO_MATCH_THRESHOLD = 0.92;
  var SUGGEST_THRESHOLD = 0.62;
  var UMLAUTS = [
    [/ä/g, "ae"],
    [/ö/g, "oe"],
    [/ü/g, "ue"],
    [/ß/g, "ss"],
    [/á|à|â|å|ã/g, "a"],
    [/é|è|ê|ë/g, "e"],
    [/í|ì|î|ï/g, "i"],
    [/ó|ò|ô|õ/g, "o"],
    [/ú|ù|û/g, "u"],
    [/ç/g, "c"],
    [/ñ/g, "n"]
  ];
  var NOISE = /* @__PURE__ */ new Set(["herr", "frau", "hr", "fr", "dr", "prof", "mr", "mrs", "ms"]);
  function normalizeName(input) {
    let s = (input ?? "").toLowerCase().trim();
    for (const [re, replacement] of UMLAUTS) s = s.replace(re, replacement);
    s = s.replace(/[.,;_/\\|]+/g, " ");
    s = s.replace(/[^a-z0-9\s-]/g, "");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }
  function nameTokens(input) {
    return normalizeName(input).split(/[\s-]+/).filter((t) => t.length > 0 && !NOISE.has(t)).sort();
  }
  function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const rows = [];
    for (let i = 0; i <= a.length; i++) rows.push(new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) rows[i][0] = i;
    for (let j = 0; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let value = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + cost
        );
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          value = Math.min(value, rows[i - 2][j - 2] + 1);
        }
        rows[i][j] = value;
      }
    }
    return rows[a.length][b.length];
  }
  function similarity(a, b) {
    const longest = Math.max(a.length, b.length);
    if (longest === 0) return 1;
    return 1 - editDistance(a, b) / longest;
  }
  function nameSimilarity(a, b) {
    const ta = nameTokens(a);
    const tb = nameTokens(b);
    if (!ta.length || !tb.length) return 0;
    if (ta.join(" ") === tb.join(" ")) return 1;
    const score = (from, to) => {
      let sum = 0;
      for (const token of from) {
        let best = 0;
        for (const other of to) {
          if (token.length === 1 && other.startsWith(token)) best = Math.max(best, 0.8);
          else if (other.length === 1 && token.startsWith(other)) best = Math.max(best, 0.8);
          else best = Math.max(best, similarity(token, other));
        }
        sum += best;
      }
      return sum / from.length;
    };
    const forward = score(ta, tb);
    const backward = score(tb, ta);
    let result = (forward + backward) / 2;
    if (ta.length !== tb.length) result *= 0.97;
    return Math.max(0, Math.min(1, result));
  }
  function matchName(query, items, nameOf, options = {}) {
    const {
      autoThreshold = AUTO_MATCH_THRESHOLD,
      suggestThreshold = SUGGEST_THRESHOLD,
      maxCandidates = 5,
      minLead = 0.05
    } = options;
    const cleaned = (query ?? "").trim();
    if (!cleaned) return { match: null, score: 0, candidates: [], ambiguous: false };
    const scored = [];
    for (const item of items) {
      const names = nameOf(item);
      const list = Array.isArray(names) ? names : [names];
      let best = 0;
      for (const name of list) {
        if (!name) continue;
        best = Math.max(best, nameSimilarity(cleaned, name));
        if (best === 1) break;
      }
      if (best > 0) scored.push({ item, score: Math.round(best * 1e3) / 1e3 });
    }
    scored.sort((a, b) => b.score - a.score);
    const candidates = scored.filter((c) => c.score >= suggestThreshold).slice(0, maxCandidates);
    const top = scored[0];
    if (!top) return { match: null, score: 0, candidates: [], ambiguous: false };
    const second = scored[1];
    const lead = second ? top.score - second.score : 1;
    const ambiguous = top.score >= suggestThreshold && lead < minLead;
    const isAuto = top.score >= autoThreshold && !ambiguous;
    return {
      match: isAuto ? top.item : null,
      score: top.score,
      candidates,
      ambiguous
    };
  }

  // src/lib/email/parser.ts
  var SERVICE_KEYWORDS = [
    { code: "SICHERHEIT", words: ["sicherheit", "security", "sicherheitskraft", "sicherheitskr\xE4fte", "sicherheitsdienst", "ordnungsdienst", "ordner", "doorman", "einlass", "objektschutz", "werkschutz", "revier"] },
    { code: "GASTRO", words: ["gastro", "service", "servicekraft", "servicekr\xE4fte", "kellner", "barkeeper", "tresen", "thekenkraft", "sp\xFClkraft", "buffet", "catering"] },
    { code: "PROMOTION", words: ["promotion", "hostess", "hostessen", "promoter", "messehostess", "garderobe", "empfang"] },
    { code: "LOGISTIK", words: ["logistik", "lager", "kommissionier", "stapler", "auf- und abbau", "aufbau", "abbau", "helfer", "umzug"] },
    { code: "FAHRSERVICE", words: ["fahrservice", "fahrer", "chauffeur", "shuttle", "transfer"] },
    { code: "REINIGUNG", words: ["reinigung", "reinigungskraft", "reinigungskr\xE4fte", "unterhaltsreinigung", "grundreinigung", "eventreinigung", "putz"] }
  ];
  var REQUEST_SIGNALS = [
    "anfrage",
    "ben\xF6tigen",
    "ben\xF6tige",
    "brauchen",
    "brauche",
    "personal",
    "mitarbeiter",
    "unterst\xFCtzung",
    "angebot",
    "veranstaltung",
    "event",
    "einsatz",
    "buchen",
    "kr\xE4fte",
    "sicherheitskr\xE4fte",
    "servicekr\xE4fte",
    "hostessen",
    "bewachung"
  ];
  var NUMBER_WORDS = {
    ein: 1,
    eine: 1,
    einen: 1,
    zwei: 2,
    drei: 3,
    vier: 4,
    fuenf: 5,
    f\u00FCnf: 5,
    sechs: 6,
    sieben: 7,
    acht: 8,
    neun: 9,
    zehn: 10,
    elf: 11,
    zwoelf: 12,
    zw\u00F6lf: 12,
    dreizehn: 13,
    vierzehn: 14,
    fuenfzehn: 15,
    f\u00FCnfzehn: 15,
    zwanzig: 20,
    dreissig: 30,
    drei\u00DFig: 30
  };
  var SIGNATURE_MARKERS = [
    /\n\s*(viele|beste|freundliche|herzliche)\s+gr[uü](ss|ß)e/i,
    /\n\s*mit freundlichen gr[uü](ss|ß)en/i,
    /\n\s*-{2,}\s*\n/,
    /\n\s*von meinem (iphone|ipad|android)/i
  ];
  function stripSignature(body) {
    let cut = body.length;
    for (const marker of SIGNATURE_MARKERS) {
      const m = body.match(marker);
      if (m?.index != null && m.index < cut) cut = m.index;
    }
    return body.slice(0, cut);
  }
  function stripQuotes(body) {
    const lines = body.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
      if (/^\s*>/.test(line)) continue;
      if (/^\s*am .+ schrieb .+:\s*$/i.test(line)) break;
      if (/^\s*-{3,}\s*urspr[uü]ngliche nachricht\s*-{3,}\s*$/i.test(line)) break;
      if (/^\s*von:\s*.+@/i.test(line) && out.length > 3) break;
      out.push(line);
    }
    return out.join("\n");
  }
  function parseRequestEmail(input) {
    const reference = input.referenceDate ?? /* @__PURE__ */ new Date();
    const subject = (input.subject ?? "").trim();
    const cleanBody = stripSignature(stripQuotes(input.body ?? "")).trim();
    const haystack = `${subject}
${cleanBody}`;
    const lower = normalize(haystack);
    const result = {
      company: empty(),
      contactPerson: empty(),
      email: empty(),
      phone: empty(),
      eventName: empty(),
      eventDate: empty(),
      startTime: empty(),
      endTime: empty(),
      meetingTime: empty(),
      location: empty(),
      employeesNeeded: empty(),
      serviceType: empty(),
      message: cleanBody,
      missingFields: [],
      confidence: 0,
      isRequest: false
    };
    result.isRequest = REQUEST_SIGNALS.filter((w) => lower.includes(w)).length >= 2;
    if (input.fromEmail) result.email = { value: input.fromEmail.toLowerCase(), confidence: 1, evidence: "Absender" };
    else {
      const mail = haystack.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (mail) result.email = { value: mail[0].toLowerCase(), confidence: 0.8, evidence: mail[0] };
    }
    if (input.fromName?.trim()) {
      result.contactPerson = { value: input.fromName.trim(), confidence: 0.7, evidence: "Absender" };
    }
    const signed = input.body?.match(/gr[uü](?:ss|ß)e?\s*[,\n]+\s*([A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+){0,2})/);
    if (signed?.[1]) result.contactPerson = { value: signed[1].trim(), confidence: 0.85, evidence: signed[0] };
    const phone = haystack.match(/(?:tel\.?|telefon|mobil|handy)[:\s]*(\+?[\d\s()/-]{6,})/i) ?? haystack.match(/(\+49[\d\s()/-]{6,}|0\d{2,5}[\s/-]?\d{3,}[\d\s/-]*)/);
    if (phone?.[1]) {
      const cleaned = phone[1].replace(/\s+/g, " ").trim();
      if (cleaned.replace(/\D/g, "").length >= 7) {
        result.phone = { value: cleaned, confidence: 0.75, evidence: phone[0] };
      }
    }
    const company = haystack.match(/\b([A-ZÄÖÜ][\wäöüß&.\- ]{2,40}?\s+(?:GmbH(?:\s*&\s*Co\.?\s*KG)?|AG|KG|e\.?\s?K\.?|UG(?:\s*\(haftungsbeschr[aä]nkt\))?|e\.?\s?V\.?|OHG|SE))/);
    if (company?.[1]) result.company = { value: company[1].replace(/\s+/g, " ").trim(), confidence: 0.8, evidence: company[0] };
    else if (result.email.value) {
      const domain = result.email.value.split("@")[1] ?? "";
      const free = ["gmail.com", "web.de", "gmx.de", "gmx.net", "outlook.com", "hotmail.com", "yahoo.de", "t-online.de", "icloud.com", "posteo.de", "mail.de"];
      if (domain && !free.includes(domain)) {
        const base = domain.split(".")[0] ?? "";
        if (base.length > 2) {
          result.company = { value: base.charAt(0).toUpperCase() + base.slice(1), confidence: 0.4, evidence: domain };
        }
      }
    }
    const dateMatch = findDate(haystack, reference);
    if (dateMatch) result.eventDate = dateMatch;
    const span = findTimeSpan(haystack);
    if (span) {
      result.startTime = { value: span.start, confidence: span.confidence, evidence: span.evidence };
      if (span.end) result.endTime = { value: span.end, confidence: span.confidence, evidence: span.evidence };
    }
    const meeting = haystack.match(/(?:treffpunkt|treffen|treffzeit|anwesend|vor ort)[^.\n]{0,40}?(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr)?/i);
    if (meeting?.[1]) {
      const minutes = parseTimeToMinutes(meeting[1]);
      if (minutes != null) result.meetingTime = { value: formatMinutes(minutes), confidence: 0.8, evidence: meeting[0].trim() };
    }
    const count = findEmployeeCount(haystack);
    if (count) result.employeesNeeded = count;
    let bestService = null;
    for (const entry of SERVICE_KEYWORDS) {
      const hits = entry.words.filter((w) => lower.includes(w)).length;
      if (hits > 0 && (!bestService || hits > bestService.hits)) bestService = { code: entry.code, hits };
    }
    if (bestService) {
      result.serviceType = { value: bestService.code, confidence: Math.min(0.95, 0.6 + bestService.hits * 0.15) };
    }
    const location = findLocation(haystack);
    if (location) result.location = location;
    if (subject) {
      const cleanedSubject = subject.replace(/^(aw|re|fwd?|wg)\s*:\s*/i, "").replace(/\b(anfrage|personalanfrage|kontaktformular|angebot)\b\s*[:–-]?\s*/gi, "").trim();
      if (cleanedSubject.length >= 3) {
        result.eventName = { value: cleanedSubject, confidence: 0.6, evidence: "Betreff" };
      }
    }
    const required = [
      ["eventDate", "Datum"],
      ["startTime", "Startzeit"],
      ["endTime", "Endzeit"],
      ["location", "Ort"],
      ["employeesNeeded", "Anzahl Mitarbeiter"],
      ["serviceType", "Leistungsart"],
      ["contactPerson", "Ansprechpartner"]
    ];
    const confidences = [];
    for (const [key, label] of required) {
      const field = result[key];
      if (field.value == null) result.missingFields.push(label);
      else confidences.push(field.confidence);
    }
    result.confidence = confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / required.length * 100) / 100 : 0;
    return result;
  }
  function empty() {
    return { value: null, confidence: 0 };
  }
  function normalize(text) {
    return text.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  }
  function findDate(text, reference) {
    const patterns = [
      { re: /\b(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})\b/, confidence: 0.95 },
      { re: /\b(\d{4}-\d{2}-\d{2})\b/, confidence: 0.95 },
      { re: /\b(\d{1,2}\.\s?\d{1,2}\.)(?!\d)/, confidence: 0.8 },
      { re: /\b(\d{1,2}\.?\s+(?:januar|februar|m[aä]rz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+\d{4})?)\b/i, confidence: 0.9 }
    ];
    for (const { re, confidence } of patterns) {
      const m = text.match(re);
      if (!m?.[1]) continue;
      const parsed = parseGermanDate(m[1].replace(/\s+/g, " ").trim(), reference);
      if (parsed) return { value: isoDate(parsed), confidence, evidence: m[0] };
    }
    const lower = normalize(text);
    if (/\bmorgen\b/.test(lower) && !/\buebermorgen\b/.test(lower)) {
      return { value: isoDate(new Date(reference.getTime() + 864e5)), confidence: 0.5, evidence: "morgen" };
    }
    return null;
  }
  function findTimeSpan(text) {
    const patterns = [
      /(?:von|ab|zwischen)\s*(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr)?\s*(?:bis|-|–|—|und)\s*(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr)?/i,
      /(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr)?\s*(?:bis|-|–|—)\s*(\d{1,2}(?:[:.]\d{2})?)\s*uhr/i,
      /(\d{1,2}[:.]\d{2})\s*(?:-|–|—|bis)\s*(\d{1,2}[:.]\d{2})/
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (!m?.[1]) continue;
      const start = parseTimeToMinutes(m[1]);
      const end = m[2] ? parseTimeToMinutes(m[2]) : null;
      if (start == null) continue;
      return {
        start: formatMinutes(start),
        end: end == null ? null : formatMinutes(end),
        confidence: 0.9,
        evidence: m[0].trim()
      };
    }
    const single = text.match(/\bab\s*(\d{1,2}(?:[:.]\d{2})?)\s*uhr\b/i);
    if (single?.[1]) {
      const start = parseTimeToMinutes(single[1]);
      if (start != null) return { start: formatMinutes(start), end: null, confidence: 0.7, evidence: single[0].trim() };
    }
    return null;
  }
  function findEmployeeCount(text) {
    const unitWords = "mitarbeiter|mitarbeitende|kr[a\xE4]fte|kraft|personen|leute|sicherheitskr[a\xE4]fte|servicekr[a\xE4]fte|hostessen|hostess|ordner|fahrer|helfer|reinigungskr[a\xE4]fte|personal";
    const numeric = text.match(new RegExp(`\\b(\\d{1,3})\\s*(?:x\\s*)?(?:${unitWords})`, "i"));
    if (numeric?.[1]) {
      const n = Number(numeric[1]);
      if (n > 0 && n <= 999) return { value: n, confidence: 0.9, evidence: numeric[0].trim() };
    }
    const reversed = text.match(new RegExp(`(?:${unitWords})\\s*[:\\s]\\s*(\\d{1,3})\\b`, "i"));
    if (reversed?.[1]) {
      const n = Number(reversed[1]);
      if (n > 0 && n <= 999) return { value: n, confidence: 0.85, evidence: reversed[0].trim() };
    }
    const worded = normalize(text).match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\s+(?:${normalize(unitWords)})`, "i"));
    if (worded?.[1]) {
      const n = NUMBER_WORDS[worded[1].toLowerCase()];
      if (n) return { value: n, confidence: 0.7, evidence: worded[0].trim() };
    }
    return null;
  }
  function findLocation(text) {
    const labelled = text.match(/(?:veranstaltungsort|einsatzort|ort|location|adresse)\s*[:\-]\s*([^\n]{3,80})/i);
    if (labelled?.[1]) return { value: ortGrenze(labelled[1]), confidence: 0.9, evidence: labelled[0].trim() };
    const inPlace = text.match(/\bin\s+((?:der\s+|dem\s+)?[A-ZÄÖÜ][\wäöüß.-]+(?:[\s-][A-ZÄÖÜ][\wäöüß.-]+){0,3})/);
    if (inPlace?.[1]) {
      const value = ortGrenze(inPlace[1]);
      if (!/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Januar|Februar|M[aä]rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)$/i.test(value)) {
        return { value, confidence: 0.6, evidence: inPlace[0].trim() };
      }
    }
    const zip = text.match(/\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß-]+)/);
    if (zip) return { value: `${zip[1]} ${zip[2]}`, confidence: 0.7, evidence: zip[0] };
    return null;
  }
  function ortGrenze(text) {
    return text.split(/\.\s/)[0].trim().replace(/[.,;:]+$/, "").trim();
  }

  // src/lib/reconcile/engine.ts
  var ISSUE_LABEL = {
    MITARBEITER_UNBEKANNT: "Mitarbeiter unbekannt",
    MITARBEITER_MEHRDEUTIG: "Mehrere \xE4hnliche Treffer",
    NICHT_GEPLANT: "Nicht geplant",
    KEINE_IST_ZEIT: "Keine Ist-Zeit",
    STARTZEIT_FEHLT: "Startzeit fehlt",
    ENDZEIT_FEHLT: "Endzeit fehlt",
    DATUM_FEHLT: "Datum fehlt",
    DATUM_UNGUELTIG: "Datum unlesbar",
    DATUM_ABWEICHEND: "Datum weicht ab",
    EVENT_ABWEICHEND: "Anderes Event",
    EVENT_UNBEKANNT: "Event nicht gefunden",
    STARTZEIT_ABWEICHEND: "Startzeit weicht ab",
    ENDZEIT_ABWEICHEND: "Endzeit weicht ab",
    PAUSE_ABWEICHEND: "Pause weicht ab",
    DOPPELTER_DATENSATZ: "Doppelter Datensatz"
  };
  var EMPTY_SUMMARY = {
    totalRows: 0,
    matchedRows: 0,
    deviationRows: 0,
    unknownRows: 0,
    duplicateRows: 0,
    missingRows: 0,
    extraRows: 0,
    ambiguousRows: 0
  };
  function reconcile(actualRows, planned, employees, options = {}) {
    const {
      toleranceMinutes = 15,
      breakToleranceMinutes = 15,
      reportMissing = true,
      referenceDate = /* @__PURE__ */ new Date()
    } = options;
    const employeeById = new Map(employees.map((e) => [e.id, e]));
    const byPersonnelNo = new Map(
      employees.filter((e) => e.personnelNo).map((e) => [e.personnelNo.trim().toLowerCase(), e])
    );
    const planIndex = /* @__PURE__ */ new Map();
    for (const shift of planned) {
      const key = `${shift.employeeId}|${shift.date}`;
      const list = planIndex.get(key);
      if (list) list.push(shift);
      else planIndex.set(key, [shift]);
    }
    const usedAssignments = /* @__PURE__ */ new Set();
    const seenKeys = /* @__PURE__ */ new Map();
    const rows = [];
    const dates = [];
    for (const actual of actualRows) {
      const issues = [];
      const row = blankRow(actual);
      let employee = null;
      let score = 0;
      let candidates = [];
      let ambiguous = false;
      const pnr = actual.personnelNo ? String(actual.personnelNo).trim().toLowerCase() : "";
      if (pnr && byPersonnelNo.has(pnr)) {
        employee = byPersonnelNo.get(pnr);
        score = 1;
      } else if (actual.name?.trim()) {
        const result = matchName(actual.name, employees, (e) => [
          `${e.firstName} ${e.lastName}`,
          `${e.lastName} ${e.firstName}`,
          e.personnelNo
        ]);
        employee = result.match;
        score = result.score;
        candidates = result.candidates;
        ambiguous = result.ambiguous;
      }
      row.matchScore = score;
      row.candidates = candidates.map((c) => ({
        employeeId: c.item.id,
        name: `${c.item.firstName} ${c.item.lastName}`,
        score: c.score
      }));
      if (employee) {
        row.employeeId = employee.id;
        row.employeeName = `${employee.firstName} ${employee.lastName}`;
      }
      const parsedDate = actual.date == null || actual.date === "" ? null : parseGermanDate(actual.date, referenceDate);
      if (actual.date == null || actual.date === "") issues.push("DATUM_FEHLT");
      else if (!parsedDate) issues.push("DATUM_UNGUELTIG");
      if (parsedDate) {
        row.date = isoDate(parsedDate);
        dates.push(row.date);
      }
      row.actualStart = normalizeTime(actual.start);
      row.actualEnd = normalizeTime(actual.end);
      row.actualBreak = parseBreak(actual.break);
      if (!row.actualStart) issues.push("STARTZEIT_FEHLT");
      if (!row.actualEnd) issues.push("ENDZEIT_FEHLT");
      if (row.actualStart && row.actualEnd) {
        row.actualMinutes = shiftMinutes(row.actualStart, row.actualEnd, row.actualBreak ?? 0);
      }
      const dupKey = [
        employee?.id ?? normalizeName(actual.name ?? ""),
        row.date ?? "",
        row.actualStart ?? "",
        row.actualEnd ?? ""
      ].join("|");
      const firstSeen = seenKeys.get(dupKey);
      if (firstSeen !== void 0 && dupKey.replace(/\|/g, "") !== "") {
        issues.push("DOPPELTER_DATENSATZ");
        row.issues = issues;
        row.status = "DUPLIKAT";
        row.comment = `Gleicher Datensatz wie Zeile ${firstSeen}.`;
        rows.push(row);
        continue;
      }
      seenKeys.set(dupKey, actual.rowNumber);
      if (!employee) {
        issues.push(ambiguous ? "MITARBEITER_MEHRDEUTIG" : "MITARBEITER_UNBEKANNT");
        row.issues = issues;
        row.status = ambiguous ? "MEHRDEUTIG" : "UNBEKANNT";
        rows.push(row);
        continue;
      }
      const shift = row.date ? pickPlannedShift(planIndex, employee.id, row.date, actual, usedAssignments) : null;
      if (!shift) {
        issues.push("NICHT_GEPLANT");
        if (row.date && hasPlanNearby(planIndex, employee.id, row.date)) issues.push("DATUM_ABWEICHEND");
        if (actual.event && !matchesAnyEvent(planned, actual.event)) issues.push("EVENT_UNBEKANNT");
        row.issues = issues;
        row.status = "ZUSAETZLICH";
        rows.push(row);
        continue;
      }
      usedAssignments.add(shift.assignmentId);
      row.assignmentId = shift.assignmentId;
      row.eventId = shift.eventId;
      row.eventName = shift.eventName;
      row.positionId = shift.positionId;
      row.plannedStart = shift.start;
      row.plannedEnd = shift.end;
      row.plannedBreak = shift.breakMinutes;
      row.plannedMinutes = shift.start && shift.end ? shiftMinutes(shift.start, shift.end, shift.breakMinutes) : null;
      if (actual.event?.trim() && !eventMatches(shift, actual.event)) issues.push("EVENT_ABWEICHEND");
      const startDiff = timeDiffMinutes(shift.start, row.actualStart);
      const endDiff = timeDiffMinutes(shift.end, row.actualEnd);
      if (startDiff != null && Math.abs(startDiff) > toleranceMinutes) issues.push("STARTZEIT_ABWEICHEND");
      if (endDiff != null && Math.abs(endDiff) > toleranceMinutes) issues.push("ENDZEIT_ABWEICHEND");
      if (row.actualBreak != null && Math.abs(row.actualBreak - shift.breakMinutes) > breakToleranceMinutes) issues.push("PAUSE_ABWEICHEND");
      if (row.plannedMinutes != null && row.actualMinutes != null) {
        row.diffMinutes = row.actualMinutes - row.plannedMinutes;
      }
      row.issues = issues;
      row.status = issues.length === 0 ? "OK" : "ABWEICHUNG";
      rows.push(row);
    }
    const periodFrom = dates.length ? dates.reduce((a, b) => a < b ? a : b) : null;
    const periodTo = dates.length ? dates.reduce((a, b) => a > b ? a : b) : null;
    let nextRowNumber = actualRows.reduce((max, r) => Math.max(max, r.rowNumber), 0) + 1;
    if (reportMissing && periodFrom && periodTo) {
      for (const shift of planned) {
        if (usedAssignments.has(shift.assignmentId)) continue;
        if (shift.date < periodFrom || shift.date > periodTo) continue;
        const employee = employeeById.get(shift.employeeId);
        rows.push({
          ...blankRow({ rowNumber: nextRowNumber++, name: "" }),
          status: "FEHLEND",
          issues: ["KEINE_IST_ZEIT"],
          matchScore: 1,
          rawName: employee ? `${employee.firstName} ${employee.lastName}` : null,
          employeeId: shift.employeeId,
          employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
          assignmentId: shift.assignmentId,
          eventId: shift.eventId,
          eventName: shift.eventName,
          positionId: shift.positionId,
          date: shift.date,
          plannedStart: shift.start,
          plannedEnd: shift.end,
          plannedBreak: shift.breakMinutes,
          plannedMinutes: shift.start && shift.end ? shiftMinutes(shift.start, shift.end, shift.breakMinutes) : null
        });
      }
    }
    return { rows, summary: summarize(rows), periodFrom, periodTo };
  }
  function summarize(rows) {
    const summary = { ...EMPTY_SUMMARY, totalRows: rows.length };
    for (const row of rows) {
      switch (row.status) {
        case "OK":
          summary.matchedRows++;
          break;
        case "ABWEICHUNG":
          summary.matchedRows++;
          summary.deviationRows++;
          break;
        case "UNBEKANNT":
          summary.unknownRows++;
          break;
        case "MEHRDEUTIG":
          summary.unknownRows++;
          summary.ambiguousRows++;
          break;
        case "DUPLIKAT":
          summary.duplicateRows++;
          break;
        case "FEHLEND":
          summary.missingRows++;
          break;
        case "ZUSAETZLICH":
          summary.extraRows++;
          break;
      }
    }
    return summary;
  }
  function blankRow(actual) {
    return {
      rowNumber: actual.rowNumber,
      status: "ABWEICHUNG",
      issues: [],
      matchScore: 0,
      rawName: actual.name?.trim() || null,
      rawDate: actual.date == null ? null : String(actual.date),
      rawStart: actual.start == null ? null : String(actual.start),
      rawEnd: actual.end == null ? null : String(actual.end),
      rawBreak: actual.break == null ? null : String(actual.break),
      rawEvent: actual.event?.trim() || null,
      rawPosition: actual.position?.trim() || null,
      raw: actual.raw ?? null,
      employeeId: null,
      employeeName: null,
      candidates: [],
      assignmentId: null,
      eventId: null,
      eventName: null,
      positionId: null,
      date: null,
      plannedStart: null,
      plannedEnd: null,
      plannedBreak: null,
      plannedMinutes: null,
      actualStart: null,
      actualEnd: null,
      actualBreak: null,
      actualMinutes: null,
      diffMinutes: null,
      comment: actual.note?.trim() || null
    };
  }
  function parseBreak(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value > 0 && value < 1) return Math.round(value * 24 * 60);
      return Math.round(value);
    }
    const raw = String(value).trim().toLowerCase();
    if (!raw) return null;
    if (/^\d{1,2}[:.]\d{1,2}$/.test(raw)) return parseTimeToMinutes(raw);
    const num = Number(raw.replace(",", ".").replace(/\s*(minuten|min|std|stunden|stunde|h|m)\.?$/, "").trim());
    if (!Number.isFinite(num)) return null;
    if (/(^|\s|\d)(h|std|stunde|stunden)\.?$/.test(raw)) return Math.round(num * 60);
    return Math.round(num);
  }
  function pickPlannedShift(planIndex, employeeId, date, actual, used) {
    const list = (planIndex.get(`${employeeId}|${date}`) ?? []).filter((s) => !used.has(s.assignmentId));
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    const eventHint = actual.event?.trim();
    if (eventHint) {
      const byEvent = list.filter((s) => eventMatches(s, eventHint));
      if (byEvent.length === 1) return byEvent[0];
      if (byEvent.length > 1) return closestByStart(byEvent, actual.start) ?? byEvent[0];
    }
    return closestByStart(list, actual.start) ?? list[0];
  }
  function closestByStart(list, start) {
    const actualStart = parseTimeToMinutes(start);
    if (actualStart == null) return null;
    let best = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const shift of list) {
      const diff = timeDiffMinutes(shift.start, formatMinutes(actualStart));
      if (diff == null) continue;
      if (Math.abs(diff) < bestDiff) {
        bestDiff = Math.abs(diff);
        best = shift;
      }
    }
    return best;
  }
  function eventMatches(shift, hint) {
    const h = normalizeName(hint);
    if (!h) return true;
    if (normalizeName(shift.eventReference) === h) return true;
    if (normalizeName(shift.eventName) === h) return true;
    if (normalizeName(shift.eventName).includes(h) || h.includes(normalizeName(shift.eventName))) return true;
    return nameSimilarity(shift.eventName, hint) >= 0.8;
  }
  function matchesAnyEvent(planned, hint) {
    return planned.some((s) => eventMatches(s, hint));
  }
  function hasPlanNearby(planIndex, employeeId, date) {
    const base = (/* @__PURE__ */ new Date(`${date}T00:00:00Z`)).getTime();
    for (const offset of [-2, -1, 1, 2]) {
      const key = `${employeeId}|${isoDate(new Date(base + offset * 864e5))}`;
      if ((planIndex.get(key)?.length ?? 0) > 0) return true;
    }
    return false;
  }

  // src/lib/import/sheet.ts
  var ImportError = class extends Error {
    constructor(userMessage, technical) {
      super(technical ?? userMessage);
      __publicField(this, "userMessage");
      this.name = "ImportError";
      this.userMessage = userMessage;
    }
  };
  function splitCsvLine(line, delimiter) {
    const out = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else inQuotes = false;
        } else current += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        out.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    out.push(current);
    return out.map((v) => v.trim());
  }
  function detectDelimiter(sample) {
    const candidates = [";", ",", "	", "|"];
    let best = ";";
    let bestCount = -1;
    const firstLine = sample.split(/\r?\n/)[0] ?? "";
    for (const c of candidates) {
      const count = splitCsvLine(firstLine, c).length;
      if (count > bestCount) {
        bestCount = count;
        best = c;
      }
    }
    return best;
  }
  function parseCsv(content, delimiter) {
    const text = content.replace(/^﻿/, "");
    const sep = delimiter ?? detectDelimiter(text);
    const lines = text.split(/\r?\n/);
    const headerIndex = lines.findIndex((l) => l.trim().length > 0);
    if (headerIndex < 0) throw new ImportError("Die Datei enth\xE4lt keine Daten.");
    const headers = dedupeHeaders(splitCsvLine(lines[headerIndex], sep));
    const rows = [];
    let skippedEmpty = 0;
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        skippedEmpty++;
        continue;
      }
      const values = splitCsvLine(line, sep);
      const row = {};
      let hasValue = false;
      headers.forEach((h, idx) => {
        const v = values[idx] ?? "";
        row[h] = v;
        if (v !== "") hasValue = true;
      });
      if (!hasValue) {
        skippedEmpty++;
        continue;
      }
      rows.push(row);
    }
    return { headers, rows, skippedEmpty };
  }
  function dedupeHeaders(headers) {
    const seen = /* @__PURE__ */ new Map();
    return headers.map((h, idx) => {
      const base = h.trim() || `Spalte ${idx + 1}`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base} (${count + 1})`;
    });
  }

  // src/lib/import/columns.ts
  var TIMESHEET_FIELDS = [
    { field: "name", label: "Mitarbeiter (kompletter Name)", aliases: ["mitarbeiter", "name", "personal", "mitarbeitername", "besch\xE4ftigter", "kraft", "person", "employee"], required: true },
    { field: "lastName", label: "Nachname", aliases: ["nachname", "familienname", "lastname", "surname", "zuname"] },
    { field: "firstName", label: "Vorname", aliases: ["vorname", "firstname", "rufname"] },
    { field: "personnelNo", label: "Personalnummer", aliases: ["personalnummer", "persnr", "persno", "pnr", "mitarbeiternummer", "personalnr", "ausweisnummer"] },
    { field: "date", label: "Datum", aliases: ["datum", "einsatztag", "tag", "date", "einsatzdatum", "arbeitstag"], required: true },
    { field: "start", label: "Startzeit", aliases: ["start", "beginn", "von", "anfang", "startzeit", "dienstbeginn", "kommt", "checkin", "arbeitsbeginn"], required: true },
    { field: "end", label: "Endzeit", aliases: ["ende", "bis", "endzeit", "schluss", "dienstende", "geht", "checkout", "arbeitsende"], required: true },
    { field: "break", label: "Pause (Minuten)", aliases: ["pause", "pausen", "pausenzeit", "break", "unterbrechung"] },
    { field: "event", label: "Event / Einsatz", aliases: ["event", "veranstaltung", "einsatz", "objekt", "auftrag", "projekt", "eventid", "einsatzort", "baustelle"] },
    { field: "position", label: "Position / Funktion", aliases: ["position", "funktion", "t\xE4tigkeit", "bereich", "aufgabe", "posten"] },
    { field: "note", label: "Bemerkung", aliases: ["bemerkung", "notiz", "hinweis", "kommentar", "anmerkung", "info"] }
  ];
  function normalizeHeader(header) {
    return (header ?? "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
  }
  function suggestMapping(headers, fields = TIMESHEET_FIELDS) {
    const normalized = headers.map((h) => ({ raw: h, key: normalizeHeader(h) }));
    const mapping = {};
    const usedColumns = /* @__PURE__ */ new Set();
    const claim = (field, raw) => {
      mapping[field] = raw;
      usedColumns.add(raw);
    };
    for (const def of fields) {
      if (mapping[def.field]) continue;
      const hit = normalized.find((h) => !usedColumns.has(h.raw) && h.key.length > 0 && def.aliases.includes(h.key));
      if (hit) claim(def.field, hit.raw);
    }
    for (const def of fields) {
      if (mapping[def.field]) continue;
      const hit = normalized.find(
        (h) => !usedColumns.has(h.raw) && h.key.length >= 3 && def.aliases.some((a) => a.length >= 3 && (h.key.includes(a) || a.includes(h.key)))
      );
      if (hit) claim(def.field, hit.raw);
    }
    if (!mapping.name && mapping.lastName) {
    }
    const unmapped = headers.filter((h) => !usedColumns.has(h));
    const missingRequired = fields.filter((d) => d.required).map((d) => d.field).filter((field) => {
      if (mapping[field]) return false;
      if (field === "name") return !(mapping.firstName && mapping.lastName);
      return true;
    });
    return { mapping, unmapped, missingRequired };
  }
  function readName(row, mapping) {
    const direct = mapping.name ? String(row[mapping.name] ?? "").trim() : "";
    if (direct) return direct;
    const first = mapping.firstName ? String(row[mapping.firstName] ?? "").trim() : "";
    const last = mapping.lastName ? String(row[mapping.lastName] ?? "").trim() : "";
    return [first, last].filter(Boolean).join(" ").trim();
  }
  function readCell(row, mapping, field) {
    const column = mapping[field];
    if (!column) return null;
    const value = row[column];
    return value === "" ? null : value;
  }

  // src/lib/status.ts
  var EVENT_STATUS = {
    ANFRAGE: { label: "Anfrage", farbe: "blau" },
    PLANUNG: { label: "Planung", farbe: "blau" },
    TEILBESETZT: { label: "Teilbesetzt", farbe: "gelb" },
    BESETZT: { label: "Besetzt", farbe: "gruen" },
    BESTAETIGT: { label: "Best\xE4tigt", farbe: "gruen" },
    LAUFEND: { label: "Laufend", farbe: "blau" },
    ABGESCHLOSSEN: { label: "Abgeschlossen", farbe: "grau" },
    ABGERECHNET: { label: "Abgerechnet", farbe: "grau" },
    STORNIERT: { label: "Storniert", farbe: "rot" }
  };
  var ASSIGNMENT_STATUS = {
    VORGESCHLAGEN: { label: "Vorgeschlagen", farbe: "grau" },
    ANGEFRAGT: { label: "Angefragt", farbe: "gelb" },
    ZUGESAGT: { label: "Zugesagt", farbe: "gruen" },
    ABGESAGT: { label: "Abgesagt", farbe: "rot" },
    EINGETEILT: { label: "Eingeteilt", farbe: "blau" },
    ERSCHIENEN: { label: "Erschienen", farbe: "gruen" },
    NICHT_ERSCHIENEN: { label: "Nicht erschienen", farbe: "rot" },
    STORNIERT: { label: "Storniert", farbe: "grau" }
  };
  var ROW_STATUS = {
    OK: { label: "Identisch", farbe: "gruen" },
    ABWEICHUNG: { label: "Abweichung", farbe: "gelb" },
    FEHLEND: { label: "Keine Ist-Zeit", farbe: "rot" },
    UNBEKANNT: { label: "Unbekannt", farbe: "rot" },
    ZUSAETZLICH: { label: "Nicht geplant", farbe: "rot" },
    DUPLIKAT: { label: "Doppelt", farbe: "rot" },
    MEHRDEUTIG: { label: "Mehrdeutig", farbe: "rot" },
    GEPRUEFT: { label: "Gepr\xFCft", farbe: "blau" },
    IGNORIERT: { label: "Ignoriert", farbe: "grau" }
  };
  function besetzung(ist, soll) {
    if (soll <= 0) return { prozent: 0, farbe: "grau", text: "\u2013" };
    const prozent = Math.round(ist / soll * 100);
    const farbe = ist >= soll ? "gruen" : ist === 0 ? "rot" : "gelb";
    return { prozent, farbe, text: `${ist}/${soll}` };
  }

  // demo/quelle.ts
  window.HST = {
    // Zeitberechnung
    parseTimeToMinutes,
    formatMinutes,
    normalizeTime,
    shiftDuration,
    shiftMinutes,
    timeDiffMinutes,
    formatDiff,
    formatHours,
    minutesToHours,
    parseGermanDate,
    formatDateDE,
    isoDate,
    weekdayDE,
    // Namensabgleich
    normalizeName,
    nameTokens,
    editDistance,
    nameSimilarity,
    matchName,
    // E-Mail
    parseRequestEmail,
    // Import und Abgleich
    parseCsv,
    splitCsvLine,
    detectDelimiter,
    suggestMapping,
    readName,
    readCell,
    TIMESHEET_FIELDS,
    reconcile,
    ISSUE_LABEL,
    // Anzeige
    ROW_STATUS,
    EVENT_STATUS,
    ASSIGNMENT_STATUS,
    besetzung
  };
})();
