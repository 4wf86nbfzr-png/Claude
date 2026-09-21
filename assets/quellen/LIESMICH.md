# Die Vorlagen der Startseiten-Motive

Hier liegen die Aufnahmen in der Größe, in der sie hereingekommen sind.
Aus ihnen rechnet `tools/motive-bauen.py` alle Stufen unter `assets/img/`.

**Warum das im Repository steht:** ohne die Vorlage lässt sich keine Stufe
neu rechnen. Eine Stufe aus einer schon hochgerechneten Datei zu rechnen,
kodiert deren Artefakte mit — dieselbe Falle wie bei „AVIF wird aus dem
JPEG gerechnet, nie aus dem WebP". Bis September lagen diese Vorlagen
ausschließlich außerhalb des Projekts; damit war jede Neuberechnung eine
Frage des Glücks.

`tools/paket-bauen.sh` lässt den Ordner aus: auf dem Webserver hat er
nichts zu suchen, geladen wird er von keiner Seite.

| Datei | Größe | wofür |
|---|---|---|
| `bankett.jpg` | 1672 × 941 (1,57 MP) | Kopfbild der Startseite |
| `bar-gruen.jpg` | 679 × 452 (0,31 MP) | Bildband unter dem Kopfbild |
| `crew-weiss.jpg` | 640 × 480 (0,31 MP) | linke Intro-Spalte |
| `zapfen.jpg` | 480 × 640 (0,31 MP) | zweite Spalte im Schlussblock |
| `team-schild.jpg` | 1290 × 745 (0,96 MP) | Kopfband von `team.html` |
| `scheune.jpg` | 1290 × 1663 (2,15 MP) | stillgelegt, stand kurz im Intro |

**Stillgelegt heisst: in `MOTIVE` auskommentiert.** Die Vorlage bleibt
liegen, die abgeleiteten Dateien unter `assets/img/` sind heraus, weil
keine Seite sie mehr lädt und die Paketgrösse das einzige ist, woran der
Netlify-Weg schon einmal gescheitert ist. Eine Zeile einkommentieren,
einmal laufen lassen, und das Motiv ist zurück.

Eine zweite Stufe bekommt nur `bankett`, und das hat zwei Gründe, die
nichts miteinander zu tun haben: `bar-gruen` und `team-schild` sind dafür
zu klein (siehe „Was eine Vorlage tragen kann, und was nicht" in
`CLAUDE.md`), `crew-weiss` und `zapfen` stehen im Satzspiegel und werden
nie bildfüllend gezogen — dort fordert kein Gerät mehr als rund 1050 Pixel
an. Beides steht als Feld in `MOTIVE`.

Sobald eine Aufnahme mit mindestens 2400 px an der langen Kante vorliegt:
hier hineinlegen, Namen behalten, einmal `python3 tools/motive-bauen.py`.
