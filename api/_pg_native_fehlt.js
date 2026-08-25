'use strict';

/* ---------------------------------------------------------------------------
   Ein Platzhalter für `pg-native` — und warum es ihn gibt
   ---------------------------------------------------------------------------
   `pg` bringt neben dem Treiber in JavaScript einen zweiten in
   Maschinensprache mit (`pg-native`). Geladen wird der nur, wenn jemand
   `pg.native` anfasst; das tut hier niemand, und mitbündeln ließe er sich
   ohnehin nicht — eine `.node`-Datei kann esbuild nicht in eine Datei packen.

   Trotzdem stand `require("pg-native")` im gebündelten Bundle, weil esbuild
   den Aufruf stehen lässt, wenn man das Modul als extern erklärt. Netlify
   liest die fertige Funktionsdatei **selbst** noch einmal, findet den
   Aufruf und bricht den Deploy ab:

       A Netlify Function failed to require one of its dependencies.
       Cannot find module 'pg-native'

   Dass der Aufruf in einem `try`/`catch` steht, sieht diese Prüfung nicht —
   sie liest den Text, nicht den Ablauf. Die Lehre daraus ist allgemeiner:
   **eine Ausnahme, die man in die eigene Prüfung schreibt, gilt nur in der
   eigenen Prüfung.** Meine Paketprüfung ließ `pg-native` durch; Netlifys
   nicht, und Netlify hat recht.

   Deshalb wird das Modul beim Bündeln nicht extern gestellt, sondern durch
   diese Datei ERSETZT. Im Bundle steht danach kein `require("pg-native")`
   mehr, sondern dieser Wurf — und `pg` behandelt ihn genau so, wie es ein
   nicht installiertes Modul behandeln würde.

   `code = 'MODULE_NOT_FOUND'` ist dabei nicht schmückendes Beiwerk:
   `pg/lib/index.js` fängt beim Zugriff auf `pg.native` nur diesen einen
   Fehlercode ab und wirft jeden anderen weiter.
--------------------------------------------------------------------------- */

/* Der Modulname steht hier bewusst NICHT ausgeschrieben in
   Anfuehrungszeichen. Netlify liest die Funktionsdatei mit einem Parser und
   nicht mit einer Textsuche — aber ein Modulname in Anfuehrungszeichen in
   einer Datei, die genau wegen eines Modulnamens in Anfuehrungszeichen
   umgebaut wurde, ist ein unnoetiges Risiko. */
const fehler = new Error(
  'Cannot find module (nativer Postgres-Treiber): er wird in dieser ' +
  'Auslieferung nicht mitgeliefert und nicht gebraucht.');
fehler.code = 'MODULE_NOT_FOUND';
throw fehler;
