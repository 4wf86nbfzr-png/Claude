#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Die ganze Website in EINER HTML-Datei
=====================================

Zum Vorzeigen und Durchklicken ohne Server: eine einzige Datei, die alle
sechzehn Seiten traegt, mit funktionierender Navigation, echten Schriften,
echten Bildern und dem Imagefilm.

Warum ueberhaupt ein eigenes Werkzeug? Weil der naheliegende Weg — jede
Seite fuer sich mit eingebettetem CSS, JS und Bildern — an der Groesse
scheitert. Stylesheet und Skript sind zusammen rund 280 KB; sechzehnmal
eingebettet waeren das 4,5 MB fuer Dateien, die sich nie unterscheiden.
Dasselbe gilt fuer das Wortzeichen, das auf jeder Seite zweimal steht.

Deshalb gilt hier durchgehend: **jede Datei genau einmal.**

    DATEIEN   Pfad -> data:-URI            (Bilder, Schriften, Film)
    SEITEN    Dateiname -> Quelltext       (die sechzehn Seiten)
    CSS, JS   je einmal als Zeichenkette

Zusammengesetzt wird erst im Browser: die Huelle nimmt den Quelltext einer
Seite, setzt Stylesheet und Skript ein, ersetzt jede Adresse aus `assets/`
durch ihre data:-URI und uebergibt das Ergebnis als `srcdoc` an ein
<iframe>.

Warum ein <iframe> und nicht ein Umbau im selben Dokument? Weil dann jede
Seite ein echtes, frisches Dokument ist. `main.js` laeuft, wie es auf der
echten Website laeuft: einmal, von vorn, mit eigenen Beobachtern und einer
eigenen rAF-Schleife. Beim Umbau im selben Dokument muesste man alte
Zuhoerer und Schleifen von Hand wieder einsammeln — und jede vergessene
haengt sich an die naechste Seite.

Was in dieser Datei NICHT funktionieren kann, weil dazu ein Server
gehoert: das Anfrageformular, die Bewerbung und der Bestandskundenbereich.
Der Kundenbereich bleibt von selbst verborgen (er zeigt sich erst, wenn
`/api/konto` antwortet); die beiden Formulare pruefen ihre Eingaben wie
gewohnt und melden beim Absenden einen Fehler. Das ist so richtig: eine
vorgetaeuschte Erfolgsmeldung waere eine Fake-Funktion.

    python3 tools/testdatei-bauen.py [--ohne-film]
"""

import base64
import json
import mimetypes
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIEL = os.path.join(WURZEL, 'herm-website-testdatei.html')

# Die Startseite steht zuerst — sie ist die Seite, die beim Oeffnen kommt.
SEITEN_LISTE = [
    'index.html',
    'dienstleistungen.html',
    'dienstleistungen/gastro-personal.html',
    'dienstleistungen/sicherheit.html',
    'dienstleistungen/promotion-hostess.html',
    'dienstleistungen/logistik.html',
    'dienstleistungen/fahrservice.html',
    'dienstleistungen/reinigung.html',
    'referenzen.html',
    'team.html',
    'galerie.html',
    'jobs.html',
    'kontakt.html',
    'impressum.html',
    'datenschutz.html',
    '404.html',
]

# Der Film liegt im Repository mit CRF 31; fuers Paket wird eine dichtere
# Fassung gerechnet und zwischengespeichert. Fuer die Testdatei ist genau
# die richtig: 4,7 statt 6,6 MB, und ein Auge sieht den Unterschied nicht
# (siehe CLAUDE.md, „Das Netlify-Paket ist keine Kopie des Repositorys").
FILM_DICHT = os.path.join(WURZEL, '.paket-cache', 'imagefilm.webm')
FILM_ROH = os.path.join(WURZEL, 'assets', 'video', 'imagefilm.webm')


# ---------------------------------------------------------------------------
#  Dateien einsammeln
# ---------------------------------------------------------------------------

def datauri(pfad):
    typ, _ = mimetypes.guess_type(pfad)
    if pfad.endswith('.avif'):
        typ = 'image/avif'
    elif pfad.endswith('.webm'):
        typ = 'video/webm'
    elif pfad.endswith('.vtt'):
        typ = 'text/vtt'
    elif pfad.endswith('.woff2'):
        typ = 'font/woff2'
    with open(pfad, 'rb') as f:
        roh = f.read()
    return 'data:%s;base64,%s' % (typ or 'application/octet-stream',
                                  base64.b64encode(roh).decode('ascii')), len(roh)


def normieren(adresse):
    """`../assets/img/x.jpg` und `assets/img/x.jpg` sind dieselbe Datei."""
    a = adresse.split('?')[0].split('#')[0]
    while a.startswith('../'):
        a = a[3:]
    return a


# ---------------------------------------------------------------------------
#  Bilder: aus <picture> wird ein <img>
# ---------------------------------------------------------------------------
#  Ein <picture> bietet dasselbe Motiv in bis zu fuenf Fassungen an — zwei
#  Formate in zwei Groessen plus die JPEG-Rueckfallebene. Der Browser holt
#  genau eine davon. In einer Datei, in der alles mitgeliefert wird, waeren
#  die anderen vier totes Gewicht: das Fuenffache an Bytes fuer ein Bild,
#  das niemand sieht.
#
#  Deshalb bleibt hier je Motiv eine Fassung stehen, und zwar die kleinste,
#  die alle heutigen Browser lesen koennen: AVIF, sonst WebP, sonst JPEG.
#  Die grosse Stufe faellt weg — auf einem Testbildschirm ist sie den
#  doppelten Umfang nicht wert.

#  Das <picture> selbst bleibt stehen, und das ist keine Kosmetik: der
#  Beschnitt der Bildbaender liegt darauf und nicht auf der Figur
#  darueber (siehe CLAUDE.md, „Die eine Falle, die man kennen muss" — ein
#  beschnittenes Element hat keine Schnittflaeche und bekaeme nie `.in`).
#  Ohne den Kasten stand das 1613 px breite Motiv der Sicherheitsseite
#  ungeschnitten da und schob die Seite 86 px nach rechts hinaus.
PICTURE = re.compile(r'(<picture\b[^>]*>)(.*?)(</picture>)', re.S)
SOURCE_SET = re.compile(r'<source\b[^>]*?srcset="([^"]*)"[^>]*>', re.S)
IMG_SRC = re.compile(r'<img\b[^>]*?\ssrc="([^"]*)"', re.S)


def erste_adresse(srcset):
    """Aus `x.avif 1600w, x-gross.avif 2560w` wird `x.avif`."""
    return srcset.split(',')[0].strip().split(' ')[0].strip()


def picture_eindampfen(html, vorhanden):
    def ersetzen(treffer):
        auf, innen, zu = treffer.group(1), treffer.group(2), treffer.group(3)
        img = IMG_SRC.search(innen)
        if not img:
            return treffer.group(0)

        # Bewerber in der Reihenfolge, in der das Markup sie anbietet:
        # AVIF steht dort zuerst, WebP danach, das <img> zuletzt.
        bewerber = [erste_adresse(s) for s in SOURCE_SET.findall(innen)]
        bewerber.append(img.group(1))

        gewaehlt = next((b for b in bewerber if normieren(b) in vorhanden), None)
        if not gewaehlt:
            return treffer.group(0)

        # Das <img> behalten — es traegt alt, width, height, loading und
        # fetchpriority. Nur Quelle, srcset und sizes werden ersetzt.
        neu = innen[img.start():]
        ende = neu.find('>')
        marke = neu[:ende + 1]
        marke = re.sub(r'\ssrcset="[^"]*"', '', marke)
        marke = re.sub(r'\ssizes="[^"]*"', '', marke)
        marke = marke.replace('src="%s"' % img.group(1), 'src="%s"' % gewaehlt, 1)
        return auf + marke + zu

    return PICTURE.sub(ersetzen, html)


# ---------------------------------------------------------------------------
#  Kopfzeilen, die ohne Server keinen Sinn ergeben
# ---------------------------------------------------------------------------
#  Ein `preload` auf eine Datei, die als data:-URI ohnehin schon im
#  Dokument steht, laedt sie ein zweites Mal. Das Manifest und die Favicons
#  liegen nicht bei; ein Verweis darauf waere ein Fehler in der Konsole.

WEG = [
    re.compile(r'<link\s+rel="preload"[^>]*>\s*', re.S),
    re.compile(r'<link\s+rel="manifest"[^>]*>\s*', re.S),
    re.compile(r'<link\s+rel="icon"[^>]*>\s*', re.S),
    re.compile(r'<link\s+rel="apple-touch-icon"[^>]*>\s*', re.S),
    re.compile(r'<link\s+rel="canonical"[^>]*>\s*', re.S),
]

CSS_LINK = re.compile(r'<link\s+rel="stylesheet"[^>]*>\s*', re.S)
JS_TAG = re.compile(r'<script\s+[^>]*src="[^"]*main\.js"[^>]*>\s*</script>', re.S)


# Was nach dem Eindampfen noch als JPEG dasteht, ist keins der grossen
# Motive, sondern die grosse Fassung fuer die Lightbox der Galerie
# (`data-gross` am <a>). Dieselben Motive liegen als AVIF daneben — knapp
# 3 MB Unterschied fuer ein Bild, das gleich aussieht.
#
# Die Grenze davor ist wichtig: `og:image` steht als vollstaendige Adresse
# im Kopf jeder Seite und faengt ebenfalls auf `assets/img/…jpg`. Das ist
# ein Verweis fuer soziale Netzwerke und wird nie geladen — angefasst wird
# er nicht.
JPEG_REST = re.compile(r'(?<![A-Za-z0-9._/-])((?:\.\./)*assets/img/[A-Za-z0-9_-]+)\.jpg')


def leichter(html, vorhanden):
    def ersetzen(treffer):
        stamm = treffer.group(1)
        for endung in ('.avif', '.webp'):
            if normieren(stamm) + endung in vorhanden:
                return stamm + endung
        return treffer.group(0)
    return JPEG_REST.sub(ersetzen, html)


def seite_umbauen(quelle, vorhanden):
    h = quelle
    h = picture_eindampfen(h, vorhanden)
    h = leichter(h, vorhanden)
    for muster in WEG:
        h = muster.sub('', h)

    # Beide Stylesheets (fonts.css und styles.css) fallen weg und werden
    # durch EINE Marke ersetzt, die die Huelle spaeter fuellt.
    treffer = list(CSS_LINK.finditer(h))
    if treffer:
        h = CSS_LINK.sub('', h)
        stelle = h.find('</head>')
        h = h[:stelle] + '<!--HST-CSS-->\n' + h[stelle:]

    if JS_TAG.search(h):
        h = JS_TAG.sub('<!--HST-JS-->', h)
    else:
        h = h.replace('</body>', '<!--HST-JS--></body>')

    # Die Bruecke muss VOR dem Inline-Skript im Kopf stehen: dort wird
    # sessionStorage gelesen, und ohne Server hat das Dokument keins.
    stelle = h.find('<script>')
    if stelle < 0:
        stelle = h.find('</head>')
    h = h[:stelle] + '<!--HST-BRUECKE-->\n' + h[stelle:]
    return h


# ---------------------------------------------------------------------------
#  Die Bruecke im Dokument
# ---------------------------------------------------------------------------
#  Sie ist bewusst kurz. Alles, was Daten braucht, macht die Huelle von
#  aussen — im Dokument steht nur, was ohne Daten auskommt.

BRUECKE = r"""
<script>
(function(){
  /* --- sessionStorage ---------------------------------------------------
     Ohne Server hat dieses Dokument je nach Browser gar keinen Speicher
     (bei file:// wirft schon der Zugriff). `main.js` faengt das ab, aber
     dann kaeme der Vorspann bei JEDEM Seitenwechsel wieder — er merkt
     sich in `hst-intro`, dass er schon lief. Deshalb ein Speicher, der
     im Elternfenster liegt und den Wechsel ueberdauert. */
  var laden = null;
  try { laden = parent.__hstSpeicher; } catch(e){}
  if(!laden) laden = window.__HST_SAAT__ || {};
  var geht = false;
  try {
    window.sessionStorage.setItem('hst-probe','1');
    window.sessionStorage.removeItem('hst-probe');
    geht = true;
  } catch(e){}
  if(!geht){
    try {
      Object.defineProperty(window, 'sessionStorage', { configurable:true, value:{
        getItem:    function(k){ return Object.prototype.hasOwnProperty.call(laden,k) ? laden[k] : null; },
        setItem:    function(k,v){ laden[k] = String(v); },
        removeItem: function(k){ delete laden[k]; },
        clear:      function(){ for(var k in laden) delete laden[k]; }
      }});
    } catch(e){}
  }

  /* --- Wege ------------------------------------------------------------
     Jeder Verweis auf eine andere Seite geht an die Huelle; die baut das
     naechste Dokument. Sprungmarken innerhalb der Seite (#inhalt) und
     mailto:/tel: bleiben unberuehrt — die kann der Browser selbst. */
  document.addEventListener('click', function(ev){
    if(ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target.closest && ev.target.closest('a[href]');
    if(!a) return;
    var href = a.getAttribute('href') || '';
    if(!href || href.charAt(0) === '#') return;
    if(/^(mailto:|tel:|javascript:)/i.test(href)) return;

    if(/^https?:\/\//i.test(href)){
      /* Fremde Ziele gehen in ein neues Fenster — in einem Rahmen von
         wenigen hundert Pixeln waere eine fremde Seite unbrauchbar. */
      ev.preventDefault();
      try { window.open(href, '_blank', 'noopener'); } catch(e){}
      return;
    }
    if(!/\.html(\?|#|$)/i.test(href)) return;

    ev.preventDefault();
    try { parent.postMessage({ hst:'weg', ziel:href }, '*'); } catch(e){}
  }, true);
})();
</script>
"""


# ---------------------------------------------------------------------------
#  Die Huelle
# ---------------------------------------------------------------------------

HUELLE = r"""<title>HERM Service Team</title>
<style>
  html,body{ margin:0; padding:0; height:100%; background:#000; }
  /* Der Rahmen ist das Fenster. Keine Leiste, kein Rand, kein Hinweis
     ueber der Seite: was hier zu sehen ist, soll genau das sein, was auch
     unter der eigenen Adresse zu sehen waere. */
  #blatt{ position:fixed; inset:0; width:100%; height:100%; border:0; display:block; background:#000; }
  #warte{ position:fixed; inset:0; display:grid; place-items:center; color:#fff;
          font:400 13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;
          letter-spacing:.08em; text-transform:uppercase; background:#000; }
</style>

<div id="warte">Testfassung wird aufgebaut</div>
<iframe id="blatt" title="HERM Service Team" allow="autoplay; fullscreen"></iframe>

<script>
@@DATEN@@

(function(){
  var rahmen = document.getElementById('blatt');
  var warte  = document.getElementById('warte');

  /* Der Speicher der Seiten liegt hier, nicht im Rahmen: er soll den
     Seitenwechsel ueberdauern (siehe Bruecke). */
  window.__hstSpeicher = {};

  function normieren(a){
    a = String(a).split('?')[0].split('#')[0];
    while(a.slice(0,3) === '../') a = a.slice(3);
    return a;
  }

  /* Eine Adresse aus `assets/` gegen ihre data:-URI tauschen. Fehlt die
     grosse Stufe, tut es die kleine — sie zeigt dasselbe Motiv. */
  function datei(adresse){
    var p = normieren(adresse);
    if(DATEIEN[p]) return DATEIEN[p];
    var ohne = p.replace(/-gross(\.[a-z0-9]+)$/, '$1');
    if(DATEIEN[ohne]) return DATEIEN[ohne];
    return null;
  }
  window.HST_DATEI = datei;

  var ADRESSE = /(?:\.\.\/)*assets\/[a-z]+\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9_-]+\.[a-z0-9]{2,5}/g;

  function bauen(name, ersteSeite){
    var h = SEITEN[name];
    if(h == null) return null;
    h = h.replace('<!--HST-CSS-->',  function(){ return '<style>' + CSS + '</style>'; });
    h = h.replace('<!--HST-JS-->',   function(){ return '<script>' + JS + '<\/script>'; });
    h = h.replace('<!--HST-BRUECKE-->', function(){
      return '<script>window.__HST_SAAT__=' + JSON.stringify(ersteSeite ? {} : {'hst-intro':'1'}) + ';<\/script>' + BRUECKE;
    });
    h = h.replace(ADRESSE, function(m){ return datei(m) || m; });
    return h;
  }

  /* --- Bilder, die erst spaeter entstehen -------------------------------
     Die Kacheln der Unterleiste baut `main.js` selbst und setzt dabei
     Adressen zusammen, die im Quelltext nirgends stehen. Eine Ersetzung
     im Text erreicht sie deshalb nicht. Beobachtet wird von hier aus:
     die Karte mit den Dateien liegt in diesem Fenster, und sie soll auch
     hier bleiben — sechzehnmal mitgeliefert waere sie das Vielfache. */
  function bilderNachziehen(dok){
    var WAS = 'img[src],source[srcset],video[poster]';

    function fuellen(wurzel){
      if(!wurzel || !wurzel.querySelectorAll) return;
      /* Die Wurzel gehoert dazu, nicht nur das, was darunter haengt.
         Der Beobachter meldet beim Nachziehen der Kacheln genau ein
         <img> — und ein <img> hat keine Nachkommen. Mit `querySelectorAll`
         allein blieb es deshalb stehen, und die sechs Kacheln der
         Unterleiste waren die einzigen Bilder ohne data:-URI. */
      var alle = [].slice.call(wurzel.querySelectorAll(WAS));
      if(wurzel.matches && wurzel.matches(WAS)) alle.unshift(wurzel);
      for(var i = 0; i < alle.length; i++){
        var el = alle[i];
        ['src','srcset','poster'].forEach(function(feld){
          var wert = el.getAttribute && el.getAttribute(feld);
          if(!wert || wert.slice(0,5) === 'data:') return;
          if(wert.indexOf('assets/') < 0) return;
          var u = datei(wert.split(' ')[0]);
          if(u) el.setAttribute(feld, u);
        });
      }
    }
    fuellen(dok);
    try {
      new (dok.defaultView.MutationObserver || MutationObserver)(function(listen){
        for(var i = 0; i < listen.length; i++){
          var l = listen[i];
          if(l.type === 'attributes') fuellen(l.target.parentNode || dok);
          for(var k = 0; k < l.addedNodes.length; k++) fuellen(l.addedNodes[k]);
        }
      }).observe(dok.documentElement, {
        subtree:true, childList:true, attributes:true,
        attributeFilter:['src','srcset','poster']
      });
    } catch(e){}
  }

  var jetzt = null, erste = true;

  function zeigen(name, ausGeschichte){
    name = normieren(name).replace(/^\.\//, '');
    if(!SEITEN[name]){
      /* Ein Weg, der ins Leere zeigt, bekommt die Fehlerseite — genau
         wie unter einer echten Adresse. */
      name = '404.html';
      if(!SEITEN[name]) return;
    }
    var h = bauen(name, erste);
    erste = false;
    jetzt = name;
    rahmen.srcdoc = h;
    if(!ausGeschichte){
      try { history.pushState({ hst:name }, '', '#' + name); } catch(e){}
    }
    if(warte){ warte.remove(); warte = null; }
  }

  rahmen.addEventListener('load', function(){
    var d = null;
    try { d = rahmen.contentDocument; } catch(e){}
    if(d && d.documentElement) bilderNachziehen(d);
  });

  window.addEventListener('message', function(ev){
    var n = ev.data;
    if(!n || n.hst !== 'weg') return;
    var ziel = String(n.ziel);
    var marke = '';
    var raute = ziel.indexOf('#');
    if(raute >= 0){ marke = ziel.slice(raute); ziel = ziel.slice(0, raute); }
    if(normieren(ziel) === jetzt && marke){
      /* Dieselbe Seite, andere Sprungmarke: nicht neu bauen, nur springen. */
      try {
        var d = rahmen.contentDocument;
        var z = d.querySelector(marke);
        if(z){ z.scrollIntoView({behavior:'smooth', block:'start'}); return; }
      } catch(e){}
    }
    zeigen(ziel + marke);
  });

  window.addEventListener('popstate', function(ev){
    var n = (ev.state && ev.state.hst) || (location.hash || '').slice(1) || 'START';
    zeigen(n === 'START' ? @@START@@ : n, true);
  });

  var anfang = (location.hash || '').slice(1);
  zeigen(anfang && SEITEN[normieren(anfang)] ? anfang : @@START@@, true);
})();
</script>
"""


# ---------------------------------------------------------------------------
#  Bauen
# ---------------------------------------------------------------------------

def js_text(s):
    """Als JS-Zeichenkette, rein ASCII und ohne `</script>`-Falle."""
    return json.dumps(s, ensure_ascii=True).replace('</', '<\\/')


def main():
    ohne_film = '--ohne-film' in sys.argv

    quellen = {}
    for name in SEITEN_LISTE:
        pfad = os.path.join(WURZEL, name)
        if not os.path.exists(pfad):
            print('   fehlt, uebersprungen: %s' % name)
            continue
        with open(pfad, encoding='utf-8') as f:
            quellen[name] = f.read()

    # --- Welche Dateien werden gebraucht? ---------------------------------
    gebraucht = set()
    # Unterordner sind erlaubt (`assets/img/referenzen/…`), eine Endung ist
    # Pflicht — sonst passt das Muster auch auf den Ordner selbst.
    adresse = re.compile(r'(?:\.\./)*assets/[a-z]+/(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9_-]+\.[a-z0-9]{2,5}')
    for h in quellen.values():
        for t in adresse.findall(h):
            gebraucht.add(normieren(t))

    # Die Kacheln der Unterleiste setzt `main.js` erst im Browser zusammen;
    # im Quelltext der Seiten steht keine einzige davon.
    with open(os.path.join(WURZEL, 'assets/js/main.js'), encoding='utf-8') as f:
        js_quelle = f.read()
    for datei_name in sorted(os.listdir(os.path.join(WURZEL, 'assets/img'))):
        if datei_name.endswith('-mini.webp'):
            gebraucht.add('assets/img/' + datei_name)

    # Was auf der Platte liegt — daran entscheidet sich, welche Fassung
    # eines Motivs stehen bleibt.
    vorhanden = set()
    for ordner in ('assets/img', 'assets/logo', 'assets/video'):
        voll = os.path.join(WURZEL, ordner)
        if os.path.isdir(voll):
            for d in os.listdir(voll):
                vorhanden.add(ordner + '/' + d)

    # --- Seiten umbauen ---------------------------------------------------
    seiten = {}
    for name, h in quellen.items():
        seiten[name] = seite_umbauen(h, vorhanden)

    # Nach dem Eindampfen der <picture> stehen andere Adressen da als vorher.
    gebraucht = set()
    for h in seiten.values():
        for t in adresse.findall(h):
            gebraucht.add(normieren(t))
    for d in sorted(os.listdir(os.path.join(WURZEL, 'assets/img'))):
        if d.endswith('-mini.webp'):
            gebraucht.add('assets/img/' + d)

    # --- Stylesheet: zwei Dateien, eine Zeichenkette -----------------------
    css = ''
    for teil in ('assets/css/fonts.css', 'assets/css/styles.css'):
        with open(os.path.join(WURZEL, teil), encoding='utf-8') as f:
            css += f.read() + '\n'

    def schrift(treffer):
        pfad = os.path.join(WURZEL, 'assets/fonts', os.path.basename(treffer.group(1)))
        if not os.path.exists(pfad):
            return treffer.group(0)
        uri, _ = datauri(pfad)
        return "url('%s')" % uri

    css = re.sub(r"url\(['\"]?(\.\./fonts/[^'\")]+)['\"]?\)", schrift, css)

    # --- Bilder im Stylesheet ---------------------------------------------
    #  Vier Stellen holen ein Bild aus dem CSS: das Wortzeichen im Vorspann
    #  und in der App-Leiste, dazu die beiden Torfluegel der Logistik. Sie
    #  fielen zuerst durch, weil sie nicht `assets/img/…` heissen, sondern
    #  `../img/…` — das Stylesheet liegt ja einen Ordner tiefer.
    #
    #  Eingesetzt wird nicht die data:-URI selbst, sondern eine Variable
    #  darauf. Der Grund steht in derselben Regel: `.gate__leaf` nennt sein
    #  Bild dreimal (einmal als Rueckfall, zweimal in `image-set`). Dreimal
    #  dieselbe data:-URI waeren 384 KB fuer ein Bild von 128.
    #
    #  In `@font-face` geht das ausdruecklich NICHT — Deskriptoren nehmen
    #  keine Variablen. Die Schriften stehen deshalb oben als Klartext.
    css_bilder = {}

    def css_bild(treffer):
        rel = treffer.group(1)
        pfad = 'assets/' + rel[3:]
        # Dieselbe Sparsamkeit wie im Markup: JPEG nur, wenn es nichts
        # Leichteres gibt.
        if pfad.endswith('.jpg'):
            for endung in ('.avif', '.webp'):
                if pfad[:-4] + endung in vorhanden:
                    pfad = pfad[:-4] + endung
                    break
        if pfad not in vorhanden:
            return treffer.group(0)
        if pfad not in css_bilder:
            css_bilder[pfad] = '--hst-bild-%d' % (len(css_bilder) + 1)
        return 'var(%s)' % css_bilder[pfad]

    css = re.sub(r"url\(['\"]?(\.\./(?:img|logo|video)/[^'\")]+)['\"]?\)", css_bild, css)

    if css_bilder:
        zeilen = []
        for pfad, name in css_bilder.items():
            uri, _ = datauri(os.path.join(WURZEL, pfad))
            zeilen.append('%s:url("%s");' % (name, uri))
        css = ':root{\n' + '\n'.join(zeilen) + '\n}\n' + css

    # --- Dateien einsammeln ------------------------------------------------
    dateien = {}
    umfang = 0
    fehlend = []
    for p in sorted(gebraucht):
        if p.startswith('assets/css/') or p.startswith('assets/js/') or p.startswith('assets/fonts/'):
            continue
        if ohne_film and p.endswith('.webm'):
            continue
        voll = os.path.join(WURZEL, p)
        if p == 'assets/video/imagefilm.webm' and os.path.exists(FILM_DICHT):
            voll = FILM_DICHT
        if not os.path.exists(voll):
            # `-gross` faellt bewusst weg: die Huelle nimmt dann die
            # kleine Stufe. Alles andere ist eine echte Luecke.
            if '-gross.' not in p:
                fehlend.append(p)
            continue
        if '-gross.' in p:
            continue
        uri, roh = datauri(voll)
        dateien[p] = uri
        umfang += roh

    if fehlend:
        print('   Achtung, nicht gefunden: %s' % ', '.join(fehlend))

    # --- Zusammensetzen ----------------------------------------------------
    daten = []
    daten.append('var CSS = %s;' % js_text(css))
    daten.append('var JS = %s;' % js_text(js_quelle))
    daten.append('var BRUECKE = %s;' % js_text(BRUECKE))
    daten.append('var DATEIEN = {')
    daten.append(',\n'.join('  %s: %s' % (json.dumps(k), json.dumps(v))
                            for k, v in sorted(dateien.items())))
    daten.append('};')
    daten.append('var SEITEN = {')
    daten.append(',\n'.join('  %s: %s' % (json.dumps(k), js_text(v))
                            for k, v in seiten.items()))
    daten.append('};')

    # Ersetzt wird mit `replace`, nicht mit `%`: die Huelle enthaelt CSS,
    # und dort steht `100%` — jedes Prozentzeichen waere sonst eine
    # Formatanweisung.
    html = (HUELLE
            .replace('@@DATEN@@', '\n'.join(daten))
            .replace('@@START@@', json.dumps(SEITEN_LISTE[0])))

    # Die Datei wird rein ASCII geschrieben, und das ist Absicht: sie soll
    # sich auch dann richtig lesen, wenn niemand ihr eine Kodierung mitgibt
    # — vom Dateisystem geoeffnet, in einer Vorschau, in einem Artifact.
    # Der sichtbare Text steckt ohnehin in JS-Zeichenketten, die `js_text`
    # schon escaped hat; uebrig bleiben nur Kommentare in der Huelle.
    with open(ZIEL, 'wb') as f:
        f.write(html.encode('ascii', 'xmlcharrefreplace'))

    groesse = os.path.getsize(ZIEL)
    print('   %d Seiten, %d Dateien (%.1f MB roh)' % (len(seiten), len(dateien), umfang / 1e6))
    print('   Stylesheet %.0f KB, Skript %.0f KB' % (len(css) / 1024, len(js_quelle) / 1024))
    print('')
    print('Fertig: %s  (%.1f MB)' % (os.path.basename(ZIEL), groesse / 1e6))
    if groesse > 16 * 1024 * 1024:
        print('   Warnung: ueber 16 MB — fuer einen Artifact zu gross.')
        print('   `--ohne-film` laesst den Imagefilm weg.')


if __name__ == '__main__':
    main()
