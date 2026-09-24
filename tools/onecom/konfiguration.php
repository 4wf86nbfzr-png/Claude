<?php
/* ============================================================
   HIER TRAGEN SIE DIE ZUGANGSDATEN EIN
   ------------------------------------------------------------
   Das ist die EINZIGE Datei, die Sie anfassen müssen. Danach
   funktioniert das Anfrageformular und das Bewerbungsformular.

   Die fünf Angaben bekommen Sie im Kundenmenü von one.com unter
   „E-Mail" bei dem Postfach, über das versendet werden soll.
   Bei one.com lauten sie in aller Regel:

       Server   send.one.com
       Port     465
       Benutzer die vollständige Adresse des Postfachs
       Kennwort das Kennwort dieses Postfachs

   Bitte das Kennwort NICHT verändern, nachdem es hier steht,
   ohne es hier nachzuziehen — sonst hört der Versand still auf.

   WICHTIG: Diese Datei wird von PHP ausgeführt und nie als Text
   ausgeliefert. Wer sie im Browser aufruft, sieht eine leere Seite.
   Die .htaccess daneben sperrt sie zusätzlich.
   ============================================================ */

return [

    /* ---- Das Postfach, über das versendet wird ---- */
    'SMTP_HOST' => '',          // z. B. send.one.com
    'SMTP_PORT' => '465',       // 465 mit SSL, 587 mit STARTTLS
    'SMTP_USER' => '',          // die vollständige Adresse, z. B. info@hermserviceteam.com
    'SMTP_PASS' => '',          // das Kennwort dieses Postfachs

    /* ---- Wer die Anfragen bekommt ----
       Bleibt beides leer, gehen Anfragen UND Bewerbungen an
       info@hermserviceteam.com. Mehrere Adressen mit Komma trennen. */
    'MAIL_AN'        => '',     // Personalanfragen
    'MAIL_BEWERBUNG' => '',     // Bewerbungen; leer heißt: wie MAIL_AN

    /* ---- Was als Absender in der Mail steht ----
       Leer heißt: dieselbe Adresse wie SMTP_USER. Eine andere Adresse
       geht nur, wenn das Postfach sie versenden darf — sonst weist der
       Server sie zurück. */
    'MAIL_VON' => '',

];
