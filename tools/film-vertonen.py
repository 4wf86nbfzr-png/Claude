#!/usr/bin/env python3
"""Legt eine gesprochene Fassung der Untertitel unter den Imagefilm.

    python3 tools/film-vertonen.py

Was passiert:

1. `assets/video/imagefilm-de.vtt` wird gelesen — die Untertitel sind der
   Sprechtext. Damit kann beides nie auseinanderlaufen: wer den Text ändert,
   ändert die Ansage mit.
2. Jede Zeile wird einzeln gesprochen und **an ihrer Untertitelzeit**
   eingesetzt. Nicht am Stück, sonst verschiebt sich alles, sobald ein Satz
   einen Wimpernschlag länger gerät.
3. Die vorhandene Musik wird unter die Stimme gelegt und dabei abgesenkt,
   solange gesprochen wird (Seitenkette). Zwischen den Sätzen kommt sie von
   selbst wieder hoch.
4. Am Ende wird die Mischung auf −16 LUFS gebracht — der Wert, auf den
   Streaming-Dienste und Browser sich eingependelt haben.

**Die Stimme ist ein Platzhalter**, genau wie die Bilder des Films. Sie kommt
aus einem lokalen Sprachmodell (Thorsten, deutsche Männerstimme, 22 kHz) und
klingt ruhig und neutral, aber sie klingt synthetisch. Für den Live-Gang
gehört dort eine echte Aufnahme hin; die Zeiten stehen in der VTT-Datei.

Anders als beim Bild wird die Musik hier **neu kodiert** — sie muss ja mit
der Stimme gemischt werden. Deshalb liegt die unveränderte Musikspur unter
`assets/video/imagefilm-musik.webm`: aus ihr wird jedes Mal neu gemischt,
nie aus einer schon gemischten Fassung. Sonst verliert die Musik bei jedem
Durchgang etwas.

Voraussetzungen:
    pip install piper-tts imageio-ffmpeg
    Sprachmodell unter tools/stimme/ (siehe STIMME weiter unten)
"""
import array
import io
import os
import re
import subprocess
import sys
import tempfile
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO = os.path.join(ROOT, "assets/video")
FILM = os.path.join(VIDEO, "imagefilm.webm")
MUSIK = os.path.join(VIDEO, "imagefilm-musik.webm")
VTT = os.path.join(VIDEO, "imagefilm-de.vtt")

# Sprachmodell. Es liegt nicht im Repository — 110 MB fuer einen Platzhalter
# waeren unverhaeltnismaessig. Bezug siehe README.
STIMME = os.environ.get("STIMME", os.path.join(ROOT, "tools/stimme/de_DE-thorsten-high.onnx"))

# Etwas langsamer als die Vorgabe. Gemessen bleibt damit auch der laengste
# Satz (3,90 s) im kuerzesten Fenster (4,20 s) — und er klingt ruhiger.
TEMPO = 1.06

# ---------------------------------------------------------------------------
# Aussprache
#
# Das Sprachmodell liest nach deutschen Regeln. Bei Fremdwoertern und in
# Zusammensetzungen geht das schief — und zwar nachpruefbar: `phonemize()`
# gibt die Lautschrift heraus, bevor irgendetwas gesprochen wird.
#
#     Servicekräfte   z ɛ ɾ v i ː k ɛ k r ɛ f t ə     „Ser-wie-keck-refte"
#     Crowdmanagement k r ɔ v d m a n ɑ ɡ e ː m ɛ n t „Krowd-manaageement"
#     Fahrservice     f ɑ ː ɾ z ɛ ɾ v i ː s           „Fahr-serwiess"
#     diskret         d ɪ s k r ə t                   Schwa statt langem e
#
# Geaendert wird deshalb **nur der Sprechtext**, nie der Untertitel. Auf der
# Seite steht weiterhin „Servicekräfte"; gesprochen wird, was hier rechts
# steht. Wer einen Eintrag ergaenzt, prueft ihn mit --lautschrift nach.
#
# Einzeln steht „Service" uebrigens richtig da (s ɜ ː v ɪ s) — der Fehler
# entsteht erst in der Zusammensetzung. Deshalb steht das Wort hier nicht.
# Reihenfolge: das laengere Wort zuerst, sonst greift die Ersetzung im
# Wortinneren und das zusammengesetzte Wort geht leer aus.
AUSSPRACHE = {
    "Servicekräfte":   "Söhrwis-Kräfte",      # z ø ː ɾ v ɪ s k r ɛ f t ə
    "Fahrservice":     "Fahr-Söhrwis",        # f ɑ ː ɾ z ø ː ɾ v ɪ s
    "Crowdmanagement": "Kraud Männitschment", # k r a ʊ t m ɛ n ɪ t ʃ m ɛ n t
    "Barkeeper":       "Bar-Kieper",          # b ɑ ː ɾ k i ː p ɜ
    "Messelogistik":   "Messelogistick",      # m ɛ s ə l oː ɡ ɪ s t ɪ k
    "Logistik":        "Logistick",           # l oː ɡ ɪ s t ɪ k
    "Deutschlandweit": "Deutschlantweit",     # d ɔø t ʃ l a n t v aɪ t
    "diskret":         "diskreet",            # d ɪ s k r eː t
    "Auf- und Abbau":  "Auf und Ab-Bau",      # a ʊ f ʊ n t a p b a ʊ
    "Moin":            "Meun",                # m ɔø n  — einsilbig, wie gesprochen
}


def sprechfassung(text):
    """Aus der Untertitelzeile den Sprechtext machen."""
    for wort, laut in AUSSPRACHE.items():
        text = text.replace(wort, laut)
    return text

# Wie weit die Musik unter der Stimme zurueckgeht. Gemessen ueber drei
# Sprechstellen:
#     Verhaeltnis 12  ->  17,5 dB   Musik faellt fast weg
#     Verhaeltnis  8  ->  11,1 dB
#     Verhaeltnis  6  ->  10,6 dB   <- so ist es eingestellt
#     Verhaeltnis  4  ->   9,6 dB
# Rund zehn Dezibel sind der Punkt, an dem die Stimme klar oben liegt und die
# Musik trotzdem durchgehend hoerbar bleibt.
SCHWELLE = 0.05
VERHAELTNIS = 6
ZIEL_LUFS = -16


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


def untertitel():
    text = open(VTT, encoding="utf-8").read()
    zeilen = []
    for m in re.finditer(r"(\d\d):(\d\d):([\d.]+) --> (\d\d):(\d\d):([\d.]+)\r?\n(.+)", text):
        anfang = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
        ende = int(m[4]) * 3600 + int(m[5]) * 60 + float(m[6])
        zeilen.append((anfang, ende, m[7].strip()))
    return zeilen


def musik_sichern(ff):
    """Die unveraenderte Musik einmalig aus dem Film loesen."""
    if os.path.exists(MUSIK):
        return
    print("  Musikspur wird aus dem Film geloest (einmalig)")
    subprocess.run([ff, "-y", "-v", "error", "-i", FILM, "-vn", "-c:a", "copy", MUSIK], check=True)


def laenge(ff, datei):
    info = subprocess.run([ff, "-hide_banner", "-i", datei],
                          capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 45.01


def sprechen(zeilen, gesamtlaenge):
    """Eine durchgehende Sprachspur bauen, jede Zeile an ihrer Zeit."""
    try:
        from piper import PiperVoice, SynthesisConfig
    except ImportError:
        sys.exit("piper-tts fehlt — bitte 'pip install piper-tts' ausfuehren.")
    if not os.path.exists(STIMME):
        sys.exit(f"Sprachmodell fehlt: {STIMME}\nBezug steht in README.md unter „Der Imagefilm\".")

    stimme = PiperVoice.load(STIMME, config_path=STIMME + ".json")
    rate = stimme.config.sample_rate
    gesamt = array.array("h", bytes(0))
    zu_kurz = []

    for i, (anfang, ende, text) in enumerate(zeilen, 1):
        gesprochen = sprechfassung(text)
        puffer = io.BytesIO()
        with wave.open(puffer, "wb") as w:
            stimme.synthesize_wav(gesprochen, w, syn_config=SynthesisConfig(length_scale=TEMPO))
        puffer.seek(0)
        r = wave.open(puffer)
        proben = array.array("h", r.readframes(r.getnframes()))
        dauer = len(proben) / rate
        if dauer > ende - anfang:
            zu_kurz.append((i, dauer, ende - anfang))

        beginn = int(anfang * rate)
        if len(gesamt) < beginn:
            gesamt.extend([0] * (beginn - len(gesamt)))
        # Falls eine Zeile doch ueberlappt, wird nicht abgeschnitten, sondern
        # hinten angehaengt — ein abgehackter Satz waere schlimmer.
        gesamt.extend(proben)
        anders = " *" if gesprochen != text else "  "
        print(f"  {i}{anders} bei {anfang:5.1f}s  {dauer:4.2f}s / {ende-anfang:4.1f}s  {text[:44]}")

    if zu_kurz:
        for i, d, f in zu_kurz:
            print(f"  ! Zeile {i} ist {d:.2f}s lang, das Fenster nur {f:.1f}s")

    # Bis zum Ende mit Stille auffuellen. Ohne das endet spaeter die ganze
    # Mischung dort, wo der letzte Satz aufhoert: `sidechaincompress` hoert
    # auf, sobald *eine* seiner beiden Spuren zu Ende ist — und mit ihr das
    # Bild. Der Film war dadurch beim ersten Versuch 43 statt 45 Sekunden lang.
    voll = int(gesamtlaenge * rate)
    if len(gesamt) < voll:
        gesamt.extend([0] * (voll - len(gesamt)))

    ziel = os.path.join(tempfile.gettempdir(), "imagefilm-sprache.wav")
    with wave.open(ziel, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(gesamt.tobytes())
    return ziel


def mischen(ff, sprache):
    ton = os.path.join(tempfile.gettempdir(), "imagefilm-ton-neu.webm")
    # sidechaincompress senkt die Musik genau dann ab, wenn die Stimme
    # Pegel hat. threshold niedrig, damit auch leise Silben greifen;
    # release lang genug, dass die Musik nicht zwischen zwei Woertern
    # hochpumpt.
    # asplit ist noetig: die Stimme wird zweimal gebraucht — einmal als
    # Steuersignal fuer die Absenkung, einmal als Ton. Ein Filterausgang
    # laesst sich nur einmal verbrauchen.
    filter_ = (
        f"[1:a]aresample=48000,aformat=channel_layouts=stereo,"
        f"dynaudnorm=f=200:g=5:p=0.7,asplit=2[sp_steuer][sp_ton];"
        f"[0:a]aresample=48000,aformat=channel_layouts=stereo[mu];"
        f"[mu][sp_steuer]sidechaincompress=threshold={SCHWELLE}:ratio={VERHAELTNIS}:attack=25:release=600:"
        f"makeup=1:level_sc=1[geduckt];"
        f"[geduckt][sp_ton]amix=inputs=2:duration=first:normalize=0:weights=1 1.35[misch];"
        f"[misch]loudnorm=I={ZIEL_LUFS}:TP=-1.5:LRA=11[aus]"
    )
    subprocess.run([ff, "-y", "-v", "error", "-i", MUSIK, "-i", sprache,
                    "-filter_complex", filter_, "-map", "[aus]",
                    "-c:a", "libopus", "-b:a", "112k", ton], check=True)
    return ton


def einbauen(ff, ton):
    neu = FILM + ".neu.webm"
    subprocess.run([ff, "-y", "-v", "error", "-i", FILM, "-i", ton,
                    "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "copy", "-c:a", "copy", "-shortest", neu], check=True)
    os.replace(neu, FILM)


def lautschrift():
    """Zeigt, was das Modell aus jeder Zeile macht — vorher und nachher."""
    from piper import PiperVoice
    stimme = PiperVoice.load(STIMME, config_path=STIMME + ".json")
    def laute(t):
        return " | ".join(" ".join(x for x in s if x not in "ˈˌ")
                          for s in stimme.phonemize(t))
    for i, (_, _, text) in enumerate(untertitel(), 1):
        gesprochen = sprechfassung(text)
        print(f"{i}. {text}")
        if gesprochen != text:
            print(f"   gesprochen: {gesprochen}")
        print(f"   {laute(gesprochen)}\n")


def main():
    if "--lautschrift" in sys.argv:
        lautschrift()
        return
    ff = ffmpeg()
    zeilen = untertitel()
    print(f"{len(zeilen)} Untertitelzeilen aus {os.path.relpath(VTT, ROOT)}")
    musik_sichern(ff)
    sprache = sprechen(zeilen, laenge(ff, MUSIK))
    ton = mischen(ff, sprache)
    einbauen(ff, ton)
    print(f"\nFertig: {os.path.relpath(FILM, ROOT)} "
          f"({os.path.getsize(FILM)/1024/1024:.1f} MB)")


if __name__ == "__main__":
    main()
