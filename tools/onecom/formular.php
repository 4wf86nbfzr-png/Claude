<?php
/* ============================================================
   Das Anfrageformular auf klassischem Webspace
   ------------------------------------------------------------
   Auf Netlify macht diese Arbeit eine Node-Funktion: sie baut einen
   PDF-Beleg und einen Angebotsentwurf als Word-Datei und haengt beides
   an. Auf one.com gibt es kein Node, und die beiden Baukaesten dafuer
   (pdfkit, docx) haben in PHP keine Entsprechung, die man ohne
   Paketverwaltung mitliefern koennte.

   WAS DIESE DATEI DESHALB IST: derselbe Weg ohne die Anhaenge. Jede
   Angabe aus dem Formular steht im Text der Mail, die Anfrage kommt an,
   der Absender bekommt seine Bestaetigung. Was fehlt, ist der PDF-Beleg
   und der Angebotsentwurf.

   Das ist eine ehrliche Luecke und keine halbe Funktion: die Website
   verspricht an keiner Stelle einen Anhang.

   ANGESPROCHEN WIRD SIE ALS /api/formular — die .htaccess leitet um.
   Damit ist die Adresse dieselbe wie auf Netlify und Vercel, und
   `main.js` musste nicht angefasst werden.

   KEINE ZUGANGSDATEN IN DIESER DATEI. Sie stehen in
   `konfiguration.php` daneben, und die ist beim Ausliefern leer.
   ============================================================ */

declare(strict_types=1);

/* Der Boden: wenn in der Konfiguration nichts steht, geht es an das
   Postfach, das ohnehin im Fuss jeder Seite steht. Dieselbe
   Entscheidung wie in der Node-Fassung, und aus demselben Grund: der
   Fehler, der hier wirklich weh tut, ist ein eingerichtetes Postfach
   mit vergessener Empfaengeradresse. */
const REGELEMPFAENGER = 'info@hermserviceteam.com';

const HONIGTOEPFE = ['firmenname', 'webseite'];

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function antwort(int $code, array $daten): never {
    http_response_code($code);
    echo json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    antwort(405, ['ok' => false, 'grund' => 'Nur POST']);
}

/* ------------------------------------------------------------------
   Eingang lesen
   ------------------------------------------------------------------
   NICHT mit `parse_str()` und NICHT aus `$_POST`. Beide ersetzen in
   Feldnamen jedes Leerzeichen und jeden Punkt durch einen Unterstrich —
   eine Eigenart von PHP, die noch aus der Zeit stammt, als aus jedem
   Feld eine Variable wurde.

   Die Felder dieses Formulars heissen „Einsatz am", „Uhrzeit von",
   „USt-IdNr." und „Welcher Bereich?". Nach `parse_str()` heissen sie
   „Einsatz_am" und „USt-IdNr_" — und damit greift der Bauplan unten
   nicht mehr: die Angaben rutschen aus ihrer Reihenfolge nach unten
   unter „Weitere Angaben" und stehen dort mit Unterstrichen in der
   Mail. Genau so ist es im ersten Testlauf herausgekommen.

   Der Rumpf wird deshalb von Hand zerlegt. Das sind sechs Zeilen und
   sie halten die Feldnamen genau so, wie sie im Markup stehen.
   ------------------------------------------------------------------ */
$roh = file_get_contents('php://input') ?: '';
$typ = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
$daten = [];
if (str_contains($typ, 'application/json')) {
    $daten = json_decode($roh, true);
    if (!is_array($daten)) $daten = [];
} else {
    foreach (explode('&', $roh) as $paar) {
        if ($paar === '') continue;
        [$schluessel, $wert] = array_pad(explode('=', $paar, 2), 2, '');
        $daten[urldecode($schluessel)] = urldecode($wert);
    }
}

/* Honigtopf: unsichtbares Feld, das nur Maschinen ausfuellen. Wer
   etwas hineingeschrieben hat, bekommt ein freundliches OK und sonst
   nichts — eine Fehlermeldung waere fuer den naechsten Versuch eine
   Anleitung. */
foreach (HONIGTOEPFE as $topf) {
    if (trim((string)($daten[$topf] ?? '')) !== '') {
        antwort(200, ['ok' => true, 'referenz' => '']);
    }
    unset($daten[$topf]);
}

$art = ($daten['art'] ?? '') === 'bewerbung' ? 'bewerbung' : 'anfrage';
unset($daten['art'], $daten['form-name']);

$sauber = static fn($w) => trim((string)$w) !== '' && mb_strlen(trim((string)$w)) <= 5000;
$name = trim((string)($daten['Name'] ?? ''));
$mail = trim((string)($daten['E-Mail'] ?? ''));
$text = trim((string)($daten['Nachricht'] ?? ''));

/* Dasselbe Mindestmass wie in der Node-Fassung. Der Browser prueft das
   bereits — diese Adresse ist aber auch ohne Browser erreichbar. */
if (!$sauber($name) || !filter_var($mail, FILTER_VALIDATE_EMAIL) || !$sauber($text)) {
    antwort(400, ['ok' => false, 'grund' => 'Pflichtangaben fehlen']);
}

/* ------------------------------------------------------------------
   Konfiguration
   ------------------------------------------------------------------ */
$k = [];
if (is_file(__DIR__ . '/konfiguration.php')) {
    $k = require __DIR__ . '/konfiguration.php';
}
$hole = static function (string $name, string $ersatz = '') use ($k): string {
    $w = $k[$name] ?? getenv($name);
    return is_string($w) ? trim($w) : $ersatz;
};

$host = $hole('SMTP_HOST');
$user = $hole('SMTP_USER');
$pass = $hole('SMTP_PASS');
$port = (int)($hole('SMTP_PORT') ?: '465');
$von  = $hole('MAIL_VON') ?: $user;
$an   = $art === 'bewerbung'
      ? ($hole('MAIL_BEWERBUNG') ?: $hole('MAIL_AN') ?: REGELEMPFAENGER)
      : ($hole('MAIL_AN') ?: REGELEMPFAENGER);

if ($host === '' || $user === '' || $pass === '') {
    /* 503 ist hier kein Fehler, sondern eine Abmachung: `main.js` nimmt
       bei 404/405/501/503 den naechsten Weg der Kette und zeigt kein
       falsches Danke. */
    antwort(503, ['ok' => false, 'grund' => 'Versand noch nicht eingerichtet']);
}

/* ------------------------------------------------------------------
   Die beiden Mails
   ------------------------------------------------------------------ */
$zeit = new DateTimeImmutable('now', new DateTimeZone('Europe/Berlin'));
$kuerzel = $art === 'bewerbung' ? 'BW' : 'AN';
$zufall = strtoupper(substr(str_shuffle('ABCDEFGHJKLMNPQRSTUVWXYZ23456789'), 0, 3));
$referenz = sprintf('%s-%s-%s', $kuerzel, $zeit->format('ymd-Hi'), $zufall);

/* Die bekannten Felder zuerst und in der Reihenfolge des Formulars,
   alles Uebrige darunter. Ein neues Feld im Markup erscheint dadurch
   von selbst in der Mail — auch wenn niemand daran denkt, hier
   nachzuziehen. */
$BAUPLAN = $art === 'bewerbung'
    ? ['Name', 'E-Mail', 'Telefon', 'Bereich', 'Verfügbar ab', 'Erfahrung', 'Nachricht']
    : ['Name', 'E-Mail', 'Telefon', 'Firma', 'Dienstleistung', 'Welcher Bereich?',
       'Einsatz am', 'Einsatz bis', 'Uhrzeit von', 'Uhrzeit bis', 'Personen', 'Ort',
       'Rechnungsanschrift', 'USt-IdNr.', 'Nachricht'];

$zeilen = [];
foreach ($BAUPLAN as $feld) {
    $w = trim((string)($daten[$feld] ?? ''));
    if ($w !== '') $zeilen[$feld] = $w;
}
$weitere = [];
foreach ($daten as $feld => $w) {
    $w = trim((string)$w);
    if ($w !== '' && !isset($zeilen[$feld]) && !in_array($feld, $BAUPLAN, true)) {
        $weitere[$feld] = $w;
    }
}

/* `str_pad` zaehlt BYTES, nicht Zeichen: „Verfügbar ab:" ist damit ein
   Byte laenger als es aussieht, und die Spalte der Werte steht um ein
   Zeichen versetzt. Bei einer Handvoll Zeilen faellt das auf. */
$einruecken = static function (string $feld): string {
    $t = $feld . ':';
    return $t . str_repeat(' ', max(1, 22 - mb_strlen($t)));
};

$block = '';
foreach ($zeilen as $feld => $w) {
    $block .= $einruecken($feld) . $w . "\n";
}
if ($weitere) {
    $block .= "\nWeitere Angaben\n";
    foreach ($weitere as $feld => $w) {
        $block .= $einruecken($feld) . $w . "\n";
    }
}

$betreff = $art === 'bewerbung'
    ? "Bewerbung: $name [$referenz]"
    : "Neue Personalanfrage: $name [$referenz]";

$inhalt = ($art === 'bewerbung'
        ? "Eine neue Bewerbung über die Website.\n\n"
        : "Eine neue Personalanfrage über die Website.\n\n")
    . $block
    . "\n"
    . str_repeat('-', 58) . "\n"
    . 'Eingegangen am ' . $zeit->format('d.m.Y') . ' um ' . $zeit->format('H:i') . " Uhr\n"
    . "Referenz $referenz\n"
    . "Abgeschickt über das Formular auf hermserviceteam.com.\n"
    . "Der Absender hat der Datenschutzerklärung beim Absenden zugestimmt.\n";

$dank = $art === 'bewerbung'
    ? "Moin $name,\n\n"
        . "deine Bewerbung ist bei uns angekommen. Wir schauen sie uns an und\n"
        . "melden uns zurück, meist innerhalb weniger Tage.\n\n"
        . "Deine Referenz: $referenz\n\n"
        . "Wenn du in der Zwischenzeit etwas nachreichen möchtest, antworte\n"
        . "einfach auf diese Mail.\n\n"
        . "Viele Grüße\nHERM Service Team\n\n"
        . "HERM Service Team e.K.\nGertigstraße 12 bis 14, 22303 Hamburg\n"
        . "Telefon +49 (40) 27075100\ninfo@hermserviceteam.com\n"
        . "Mo bis Fr, 10 bis 17 Uhr\n"
    : "Guten Tag $name,\n\n"
        . "vielen Dank für Ihre Anfrage. Sie ist bei uns eingegangen und wird\n"
        . "von unserer Disposition geprüft. Ihr Angebot erhalten Sie\n"
        . "schnellstmöglich per E-Mail.\n\n"
        . "Ihre Referenz: $referenz\n\n"
        . "Wenn sich etwas an Ihrer Anfrage ändert, antworten Sie einfach auf\n"
        . "diese Mail.\n\n"
        . "Mit freundlichen Grüßen\nHERM Service Team\n\n"
        . "HERM Service Team e.K.\nGertigstraße 12 bis 14, 22303 Hamburg\n"
        . "Telefon +49 (40) 27075100\ninfo@hermserviceteam.com\n"
        . "Mo bis Fr, 10 bis 17 Uhr\n";

require __DIR__ . '/smtp.php';

$empfaenger = array_values(array_filter(array_map('trim', explode(',', $an))));

try {
    /* Die Anfrage zuerst. Sie ist das, was nicht verloren gehen darf —
       die Bestätigung an den Absender ist Höflichkeit. */
    smtp_senden($host, $port, $user, $pass, [
        'von'      => $von,
        'vonName'  => 'HERM Service Team, Website',
        'an'       => $empfaenger,
        'antwortAn'=> $mail,
        'betreff'  => $betreff,
        'text'     => $inhalt,
    ]);
} catch (Throwable $e) {
    error_log('[formular] Versand an die Disposition fehlgeschlagen: ' . $e->getMessage());
    antwort(502, ['ok' => false, 'grund' => 'Versand fehlgeschlagen']);
}

$bestaetigt = true;
try {
    smtp_senden($host, $port, $user, $pass, [
        'von'      => $von,
        'vonName'  => 'HERM Service Team',
        'an'       => [$mail],
        'antwortAn'=> REGELEMPFAENGER,
        'betreff'  => $art === 'bewerbung'
                      ? "Deine Bewerbung bei HERM Service Team [$referenz]"
                      : "Ihre Anfrage bei HERM Service Team [$referenz]",
        'text'     => $dank,
    ]);
} catch (Throwable $e) {
    /* Die Anfrage liegt bereits im Postfach. Dass die Bestätigung nicht
       durchkam, darf den Absender keinen Fehler sehen lassen. */
    error_log('[formular] Bestaetigung an den Absender fehlgeschlagen: ' . $e->getMessage());
    $bestaetigt = false;
}

antwort(200, ['ok' => true, 'referenz' => $referenz, 'bestaetigt' => $bestaetigt]);
