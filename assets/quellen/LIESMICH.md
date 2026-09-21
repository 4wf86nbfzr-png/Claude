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

`bar-gruen` ist für eine randlose Darstellung zu klein (siehe „Was eine
Vorlage tragen kann, und was nicht" in `CLAUDE.md`) und bekommt deshalb
keine zweite Stufe. Sobald eine Aufnahme mit mindestens 2400 px an der
langen Kante vorliegt: hier hineinlegen, Namen behalten, einmal
`python3 tools/motive-bauen.py`.
