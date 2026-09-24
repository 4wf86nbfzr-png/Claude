<?php
/* ============================================================
   Ein SMTP-Client in dreihundert Zeilen
   ------------------------------------------------------------
   WARUM NICHT `mail()`: die Funktion uebergibt an den lokalen
   Mailserver des Webspace. Der versendet unter einer Absenderadresse,
   fuer die die Domain kein SPF und keine DKIM-Signatur hinterlegt hat —
   und dann landet die Anfrage im Spam-Ordner oder wird ganz verworfen.
   Ueber das eigene Postfach zu versenden ist der Weg, den auch die
   Node-Fassung geht.

   WARUM KEINE BIBLIOTHEK: auf einem gewoehnlichen Webspace gibt es
   keine Paketverwaltung. Was nicht mit hochgeladen wird, ist nicht da.
   SMTP ist ein Zeilenprotokoll, und der Teil davon, den ein Formular
   braucht, passt in eine Datei.

   WAS HIER BEWUSST FEHLT: Anhaenge. Diese Fassung schickt reinen Text.
   ============================================================ */

declare(strict_types=1);

/**
 * Eine Kopfzeile nach RFC 2047 kodieren, falls sie Zeichen jenseits von
 * ASCII enthaelt. Ohne das steht im Betreff „Personalanfrage fÃ¼r".
 */
function smtp_kopf(string $wert): string {
    if (preg_match('/^[\x20-\x7E]*$/', $wert)) {
        return $wert;
    }
    return '=?UTF-8?B?' . base64_encode($wert) . '?=';
}

/**
 * Eine Adresse mit Namen: der Name wird kodiert, die Adresse nie.
 */
function smtp_adresse(string $adresse, string $name = ''): string {
    return $name === '' ? $adresse : smtp_kopf($name) . ' <' . $adresse . '>';
}

/**
 * Eine Zeile lesen und den Statuscode zurueckgeben. Mehrzeilige
 * Antworten („250-PIPELINING", „250 OK") werden bis zur letzten Zeile
 * gelesen: erkennbar am Leerzeichen an vierter Stelle statt am Strich.
 */
function smtp_lesen($sitz): array {
    $zeilen = [];
    while (true) {
        $z = fgets($sitz, 1024);
        if ($z === false) {
            throw new RuntimeException('Verbindung abgebrochen beim Lesen');
        }
        $zeilen[] = rtrim($z, "\r\n");
        if (strlen($z) < 4 || $z[3] !== '-') break;
    }
    $code = (int)substr($zeilen[0], 0, 3);
    return [$code, implode("\n", $zeilen)];
}

function smtp_sagen($sitz, string $befehl, array $erwartet, string $wofuer): string {
    if ($befehl !== '') {
        if (fwrite($sitz, $befehl . "\r\n") === false) {
            throw new RuntimeException("Verbindung abgebrochen beim Senden: $wofuer");
        }
    }
    [$code, $text] = smtp_lesen($sitz);
    if (!in_array($code, $erwartet, true)) {
        /* Das Kennwort darf nicht in ein Protokoll geraten. */
        throw new RuntimeException("$wofuer: Server antwortet $code — " . str_replace("\n", ' | ', $text));
    }
    return $text;
}

/**
 * Verschicken. Wirft bei jedem Fehler; die aufrufende Datei entscheidet,
 * was das fuer die Antwort an den Browser bedeutet.
 *
 * @param array{von:string,vonName?:string,an:string[],antwortAn?:string,betreff:string,text:string} $mail
 */
function smtp_senden(string $host, int $port, string $benutzer, string $kennwort, array $mail): void {
    $empfaenger = array_values(array_filter($mail['an'] ?? []));
    if (!$empfaenger) {
        throw new RuntimeException('Kein Empfaenger angegeben');
    }

    /* Port 465 spricht von der ersten Zeile an TLS, Port 587 faengt im
       Klartext an und schaltet mit STARTTLS um. Das ist die einzige
       Stelle, an der sich die beiden unterscheiden. */
    $implizit = $port === 465;
    $adresse = ($implizit ? 'ssl://' : 'tcp://') . $host . ':' . $port;

    $rahmen = stream_context_create(['ssl' => [
        'verify_peer'       => true,
        'verify_peer_name'  => true,
        'SNI_enabled'       => true,
        'peer_name'         => $host,
    ]]);

    $sitz = @stream_socket_client($adresse, $fehlerNr, $fehlerText, 20,
                                  STREAM_CLIENT_CONNECT, $rahmen);
    if (!$sitz) {
        throw new RuntimeException("Keine Verbindung zu $host:$port — $fehlerText ($fehlerNr)");
    }
    stream_set_timeout($sitz, 20);

    try {
        smtp_sagen($sitz, '', [220], 'Begruessung');

        $ich = $_SERVER['SERVER_NAME'] ?? 'hermserviceteam.com';
        $ehlo = smtp_sagen($sitz, "EHLO $ich", [250], 'EHLO');

        if (!$implizit) {
            if (stripos($ehlo, 'STARTTLS') === false) {
                /* Lieber gar nicht senden als unverschluesselt: im Rumpf
                   stehen Name, Anschrift und Telefonnummer eines Menschen. */
                throw new RuntimeException('Server bietet kein STARTTLS an, Abbruch');
            }
            smtp_sagen($sitz, 'STARTTLS', [220], 'STARTTLS');
            if (!stream_socket_enable_crypto($sitz, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('TLS-Aushandlung fehlgeschlagen');
            }
            /* Nach der Umschaltung muss EHLO wiederholt werden: die Liste
               der Faehigkeiten von vorher gilt nicht mehr. */
            $ehlo = smtp_sagen($sitz, "EHLO $ich", [250], 'EHLO nach STARTTLS');
        }

        if (stripos($ehlo, 'AUTH') !== false) {
            if (stripos($ehlo, 'LOGIN') !== false) {
                smtp_sagen($sitz, 'AUTH LOGIN', [334], 'AUTH LOGIN');
                smtp_sagen($sitz, base64_encode($benutzer), [334], 'Benutzername');
                smtp_sagen($sitz, base64_encode($kennwort), [235], 'Anmeldung');
            } else {
                $wort = base64_encode("\0" . $benutzer . "\0" . $kennwort);
                smtp_sagen($sitz, 'AUTH PLAIN ' . $wort, [235], 'Anmeldung');
            }
        }

        smtp_sagen($sitz, 'MAIL FROM:<' . $mail['von'] . '>', [250], 'MAIL FROM');
        foreach ($empfaenger as $e) {
            smtp_sagen($sitz, 'RCPT TO:<' . $e . '>', [250, 251], "RCPT TO $e");
        }
        smtp_sagen($sitz, 'DATA', [354], 'DATA');

        $grenze = 'hst-' . bin2hex(random_bytes(12));
        $kopf = [
            'Date: ' . (new DateTimeImmutable('now'))->format(DateTimeInterface::RFC2822),
            'From: ' . smtp_adresse($mail['von'], $mail['vonName'] ?? ''),
            'To: ' . implode(', ', $empfaenger),
            'Subject: ' . smtp_kopf($mail['betreff']),
            'Message-ID: <' . $grenze . '@hermserviceteam.com>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            /* Damit ein „Antworten" beim Absender landet und nicht beim
               Postfach, ueber das versendet wurde. */
            'Reply-To: ' . ($mail['antwortAn'] ?? $mail['von']),
            'Auto-Submitted: auto-generated',
        ];

        $rumpf = chunk_split(base64_encode($mail['text']), 76, "\r\n");

        /* Punkt-Stopfen: eine Zeile, die mit einem Punkt anfaengt, wuerde
           die Nachricht beenden. Bei base64 kann das nicht vorkommen —
           die Zeile steht hier trotzdem, weil sie beim naechsten
           Umstellen auf Klartext sonst genau einmal fehlt. */
        $rumpf = preg_replace('/^\./m', '..', $rumpf);

        fwrite($sitz, implode("\r\n", $kopf) . "\r\n\r\n" . $rumpf . "\r\n.\r\n");
        smtp_sagen($sitz, '', [250], 'Annahme der Nachricht');

        @fwrite($sitz, "QUIT\r\n");
    } finally {
        @fclose($sitz);
    }
}
