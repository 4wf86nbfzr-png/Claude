/* ============================================================
   HST Relaunch — interactions
   ============================================================ */
(function(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Preloader: Lichtbahn, das Wortzeichen taucht aus der Unschärfe auf, ein
     Glanz läuft durch die Buchstaben — dann der direkte Sprung auf die Seite.
     Nur beim ersten Öffnen — wer im selben Besuch zurück auf die Startseite
     kommt, soll nicht jedes Mal warten.

     Die Zeiten hängen an den Animationen in styles.css und müssen mit ihnen
     zusammen geändert werden:
        0,30 s  das Zeichen beginnt aufzutauchen
        2,10 s  es ist scharf, steht aber erst auf 66 % Helligkeit
        2,70 s  der Glanz ist durch (1,85 + 0,85) und das Zeichen
                gleichzeitig auf vollem Weiss (2,10 + 0,60)
     Der Schnitt kommt bei 2,75 s, also erst danach. Ein Vorspann, der
     mitten in seiner eigenen Bewegung abgeschnitten wird, liest als Fehler
     und nicht als Tempo. */
  (function(){
    const pre = document.getElementById('preloader');
    if(!pre) return;
    let gesehen = false;
    try { gesehen = sessionStorage.getItem('hst-intro') === '1'; } catch(e){}
    if(gesehen || reduce){ pre.classList.add('instant','done'); return; }
    try { sessionStorage.setItem('hst-intro','1'); } catch(e){}
    /* `los` und `.done` fallen im selben Moment. Anders als vorher ist das
       kein Übergang mehr, sondern ein Schnitt: der Vorspann ist zu Ende,
       und die Startseite steht da.

       `sofort` schaltet dabei die Einfahrt des Heros ab. Ohne das liefen
       zwei Vorspänne hintereinander — erst das Zeichen, dann eine Seite,
       die sich auch noch aufbaut. Beim zweiten Aufruf im selben Besuch
       (oben, `gesehen`) wird `sofort` nicht gesetzt: dort IST die Einfahrt
       der Einstieg. */
    const fertig = ()=>{
      if(pre.classList.contains('done')) return;   // der Notausstieg kommt nur, wenn noetig
      pre.classList.add('done');
    };
    setTimeout(fertig, 2750);          // nach dem Glanz: Schnitt
    setTimeout(fertig, 4400);          // Notausstieg, falls etwas hängt
  })();

  /* Year */
  const jahr = document.getElementById('year');
  if(jahr) jahr.textContent = new Date().getFullYear();

  /* Nav scroll state + progress bar */
  const nav = document.getElementById('nav');
  const bar = document.getElementById('scrollbar');
  const toTop = document.getElementById('toTop');
  function onScrollTop(){
    const y = window.scrollY;
    const warGescrollt = nav.classList.contains('scrolled');
    nav.classList.toggle('scrolled', y > 40);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h>0 ? (y/h*100) : 0) + '%';
    toTop.classList.toggle('show', y > window.innerHeight * 0.9);
    /* Die Kopfzeile wird beim Scrollen flacher, und an ihrer Höhe hängen die
       Unterleiste, die Kinobalken und jedes Sprungziel (--nav-h). Gemessen
       wird aber nur, wenn sich wirklich etwas geändert hat: ein
       getBoundingClientRect in jedem Scrollbild wäre ein erzwungenes Layout
       je Bild, und genau davor warnt „Erst messen, dann schreiben". */
    if(nav.classList.contains('scrolled') !== warGescrollt)
      requestAnimationFrame(navHoehe);
  }
  /* Instant jump to top — bypasses the scroll-scrubbed effects entirely */
  toTop.addEventListener('click', ()=>{
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    requestAnimationFrame(()=>{ html.style.scrollBehavior = prev; });
  });

  /* ---- Weite Sprungmarken ----
     scroll-behavior:smooth ist auf kurzen Wegen angenehm. Der Referenzen-
     Block liegt aber zwanzig Bildschirmhöhen unter dem Hero, und dazwischen
     stehen sechs Bühnen: jedes Zwischenbild dieser Reise rechnet die
     komplette Kamerafahrt neu. Das dauert spürbar lange und sieht aus, als
     würde gar nichts passieren.

     Ab vier Bildschirmhöhen wird deshalb direkt gesprungen — das ist
     genau die Grenze, an der der Bühnenblock beginnt. „Was wir stellen“
     liegt knapp davor und fährt weiterhin weich hinunter. Umgeschaltet
     wird nur die Eigenschaft, den Sprung selbst macht weiter der Browser —
     so bleiben Fokus, Adresszeile und Verlauf unangetastet. Dieselbe
     Mechanik nutzt der Knopf „Zurück nach oben“. */
  document.addEventListener('click', (ev)=>{
    const a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if(!a) return;
    const marke = a.getAttribute('href');
    if(marke.length < 2) return;
    let ziel = null;
    try { ziel = document.querySelector(marke); } catch(e){ return; }
    if(!ziel) return;
    if(Math.abs(ziel.getBoundingClientRect().top) < window.innerHeight * 4) return;
    const html = document.documentElement;
    const vorher = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    requestAnimationFrame(()=>{ html.style.scrollBehavior = vorher; });
  }, true);

  /* ---- Mobiles Menü ----
     Es liegt als Vollbild über der Seite und verhält sich damit wie ein
     Dialog. Also muss es sich auch so bedienen lassen: Escape schließt,
     der Fokus bleibt drin, und danach steht er wieder auf dem Knopf, der
     es geöffnet hat. Ohne das lief der Tabulator hinter der Überlagerung
     weiter durch die Seite — sichtbar war dort nichts. */
  const burger = document.getElementById('burger');
  const menue  = document.getElementById('mobileMenu');
  /* inert nimmt einen ganzen Bereich aus Tabulator und Vorlesewerkzeug.
     Browser, die es nicht kennen, ignorieren das Attribut — dann bleibt es
     beim bisherigen Verhalten, kaputt geht nichts. */
  const dahinter = ['main', 'footer', '#toTop'].map(w => document.querySelector(w));

  function menueSetzen(offen){
    document.body.classList.toggle('menu-open', offen);
    document.body.classList.toggle('locked', offen);
    burger.setAttribute('aria-expanded', offen);
    dahinter.forEach(el => { if(el) el.toggleAttribute('inert', offen); });
    if(offen){
      const erster = menue && menue.querySelector('a, button');
      if(erster) erster.focus();
    } else {
      burger.focus();
    }
  }

  burger.addEventListener('click', ()=> menueSetzen(!document.body.classList.contains('menu-open')));
  menue.addEventListener('click', (ev)=>{
    const a = ev.target.closest('a');
    if(!a || !menue.contains(a)) return;
    /* „Dienstleistungen" wechselt die Seite nicht, sondern klappt die sechs
       Bereiche darunter auf. Das Menü muss dafür stehen bleiben. Erkennbar
       ist der Punkt an aria-controls — das setzt nur, wer etwas aufklappt. */
    if(a.hasAttribute('aria-controls')) return;
    /* Beim Wechsel auf eine andere Seite den Fokus nicht zurückholen — das
       Dokument wird ohnehin ersetzt. */
    document.body.classList.remove('menu-open','locked');
    burger.setAttribute('aria-expanded', false);
    dahinter.forEach(el => { if(el) el.removeAttribute('inert'); });
  });
  document.addEventListener('keydown', (ev)=>{
    if(ev.key === 'Escape' && document.body.classList.contains('menu-open')) menueSetzen(false);
  });

  /* ---- Wo bin ich? ----
     Der Menüpunkt der aktuellen Seite bekommt aria-current. Daran hängt im
     Stylesheet der kleine Punkt in der Markenfarbe — die einzige Stelle in
     der Kopfzeile, an der Farbe vorkommt. Verglichen wird nur der Dateiname,
     damit es gleichermaßen unter /team.html, /team und /dienstleistungen/…
     funktioniert.

     Für die sechs Detailseiten zählt „Dienstleistungen" als aktiv: sie liegen
     im Ordner dienstleistungen/ und sind Kinder dieses Punktes. */
  (function(){
    const hier = location.pathname.replace(/\/+$/, '/');
    const datei = hier.split('/').pop() || 'index.html';
    const imOrdner = /\/dienstleistungen\//.test(hier);
    document.querySelectorAll('.nav__links a, #mobileMenu > a').forEach(a => {
      const ziel = (a.getAttribute('href') || '').split('/').pop().split('#')[0];
      if(!ziel) return;                                  // reine Sprungmarke
      const treffer = ziel === datei
        || (imOrdner && ziel === 'dienstleistungen.html');
      if(treffer) a.setAttribute('aria-current', 'page');
    });
  })();

  /* Die Punkte des Vollbildmenüs kommen nacheinander herein. Der Index steht
     im Stylesheet als --i; hier wird er nur einmal geschrieben. */
  document.querySelectorAll('#mobileMenu > a').forEach((a, i)=> a.style.setProperty('--i', i));

  /* ---- Die Unterleisten unter der Kopfzeile ----
     Zwei Menüpunkte haben mehr als ein Ziel. Fährt man mit der Maus darüber,
     kommt unter der Kopfzeile eine Leiste heraus, in der diese Ziele stehen:

       Dienstleistungen   die sechs Bereiche, jeder mit seinem Foto,
                          dazu der Weg auf die Übersicht
       Jobs               direkt bewerben, freie Stellen, häufige Fragen

     Sechs Entscheidungen dahinter:

     1. **Der Menüpunkt ist in jeder Lage ein Link.** Mit Maus, mit Finger,
        mit Tastatur, mit und ohne JavaScript führt er auf seine Seite.
        Früher fing das Skript den Klick ab und klappte statt dessen auf —
        das ging, solange nur ein Klick öffnete. Sobald das Zeigen öffnet,
        nähme ein Klick dem Benutzer weg, was er gerade vor sich hat.
     2. **Geöffnet wird beim Darüberfahren, nicht per `:hover` im
        Stylesheet.** Der Zustand liegt in der Klasse `.auf`. Mit `:hover`
        hätten Escape, das Schließen beim Scrollen, `aria-expanded` und der
        Tastaturweg keinen Angriffspunkt, und auf einem Tablet im Querformat
        klebte die Leiste, bis man woanders hin tippt.
     3. **Kopfzeile und Leiste sind eine Zone.** Die Leiste beginnt bei
        `top:0` und wird nur von der Kopfzeile überdeckt (z-index 880 gegen
        900). Zwischen Reiter und Leiste gibt es deshalb keine tote Strecke,
        die man mit einem langen Nachlauf überbrücken müsste.
     4. **Pfeil ab öffnet, Enter navigiert.** Der Tabulator allein öffnet
        nichts: wer zum Anfrage-Knopf tabbt, streift sechs Reiter. Innerhalb
        der Leiste gibt es keine Pfeiltastensteuerung — es ist kein
        `role="menu"`, sondern eine Liste von Links.
     5. **Wer nichts zu zeigen hat, zeigt nichts.** Referenzen, Team,
        Galerie und Kontakt bekommen keine Leiste und tragen deshalb weder
        `aria-expanded` noch `aria-controls`: ein Attribut, hinter dem nie
        etwas kommt, ist eine Falschaussage. Beim Darüberfahren schließen
        sie eine offene Leiste, statt eine leere zu öffnen.
     6. **Gebaut wird hier, nicht im Markup.** Die Leisten stehen auf allen
        sechzehn Seiten gleich; als Markup wären das sechzehn Kopien, die
        beim nächsten Namenswechsel auseinanderlaufen. Die Adressen stehen
        ohnehin im Fuß jeder Seite — Suchmaschinen und Leser ohne Skript
        finden sie dort.                                                    */
  (function(){
    const kopf = document.querySelector('header.nav');
    const dlPunkt = document.querySelector('.nav__links a[href$="dienstleistungen.html"]');
    if(!kopf || !dlPunkt) return;

    /* Wo liegt die Seite? Auf den sechs Detailseiten steht „../" davor.
       Aus demselben Link, den wir gerade gefunden haben, lässt sich das
       ablesen — geraten wird nichts. */
    const vor = dlPunkt.getAttribute('href').replace(/dienstleistungen\.html$/, '');

    const BEREICHE = [
      ['01', 'Gastro-Personal',     'gastro-personal',   'gastro-detail'],
      ['02', 'Sicherheit',          'sicherheit',        'sicherheit'],
      ['03', 'Promotion & Hostess', 'promotion-hostess', 'promotion-messe'],
      ['04', 'Logistik',            'logistik',          'logistik'],
      ['05', 'Fahrservice',         'fahrservice',       'fahrservice-door'],
      ['06', 'Reinigung',           'reinigung',         'reinigung']
    ];

    /* Die Reihenfolge bei Jobs ist die der Absicht, nicht die der Seite:
       auf jobs.html stehen die Stellen vor dem Formular, aber wer aus dem
       Menü kommt, will sich meistens bewerben. */
    const LEISTEN = [
      {
        id:     'megabar-dienstleistungen',
        reiter: 'dienstleistungen.html',
        name:   'Dienstleistungen',
        zeile:  'Sechs Bereiche &middot; ein Team',
        eintraege: BEREICHE.map(([nr, name, datei, bild]) => ({
          nr:   nr,
          name: name,
          href: vor + 'dienstleistungen/' + datei + '.html',
          /* Der Kasten steht sofort, das Bild kommt erst beim ersten Öffnen
             (siehe `bilderNachziehen`). Sonst holte jede der sechzehn Seiten
             sechs Fotos, die die meisten Besucher nie zu sehen bekommen —
             gemessen 300 KB pro Seite. */
          bild: vor + 'assets/img/' + bild + '-mini.webp'
        })),
        alle: { text: 'Alle Dienstleistungen ansehen', href: vor + 'dienstleistungen.html' }
      },
      {
        id:     'megabar-jobs',
        reiter: 'jobs.html',
        name:   'Jobs',
        text:   true,
        eintraege: [
          { name: 'Direkt bewerben',      href: vor + 'jobs.html#bewerbung' },
          { name: 'Freie Stellen',        href: vor + 'jobs.html#stellen'   },
          { name: 'H&auml;ufige Fragen',  href: vor + 'jobs.html#fragen'    }
        ]
      }
    ];

    const PFEIL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
      + '<path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function bauen(l){
      const el = document.createElement('div');
      el.className = 'megabar' + (l.text ? ' megabar--text' : '');
      el.id = l.id;
      /* `aria-label` an einem nackten <div> gibt kein Vorlesewerkzeug aus —
         es braucht vorher eine Rolle. */
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', l.name);
      el.innerHTML =
        '<div class="wrap megabar__inner">' +
          (l.zeile ? '<span class="eyebrow megabar__zeile">' + l.zeile + '</span>' : '') +
          '<ul class="megabar__liste">' +
            l.eintraege.map(e =>
              '<li><a href="' + e.href + '">' +
                (e.bild ? '<span class="megabar__bild" data-bild="' + e.bild + '"></span>' : '') +
                (e.nr   ? '<span class="megabar__num">' + e.nr + '</span>' : '') +
                '<span class="megabar__name">' + e.name + '</span>' +
              '</a></li>').join('') +
          '</ul>' +
          (l.alle ? '<a class="btn megabar__alle" href="' + l.alle.href + '">'
                    + l.alle.text + PFEIL + '</a>' : '') +
        '</div>';
      /* Der Versatz beim Aufbauen steht als Index am Element, die Zeiten
         rechnet das Stylesheet — dasselbe Muster wie beim Vollbildmenü. */
      el.querySelectorAll('.megabar__liste a')
        .forEach((a, i)=> a.style.setProperty('--n', i));
      return el;
    }

    /* Alle Leisten in EINEM Zug einhängen. Zweimal `kopf.after()`
       hintereinander kehrte die Reihenfolge um, und der Tabulator liefe
       dann rückwärts durch die Leisten. */
    const stapel = document.createDocumentFragment();
    const alle = [];
    LEISTEN.forEach(l => {
      const punkt = document.querySelector('.nav__links a[href$="' + l.reiter + '"]');
      if(!punkt) return;
      const el = bauen(l);
      stapel.appendChild(el);
      punkt.setAttribute('aria-expanded', 'false');
      punkt.setAttribute('aria-controls', l.id);
      alle.push({ punkt: punkt, el: el, bilderDa: false });
    });
    if(!alle.length) return;
    /* Direkt hinter die Kopfzeile, nicht ans Ende des Rumpfes: mit dem
       Tabulator kommt man dann von der Navigation aus hinein statt erst
       hinter dem Fuß. */
    kopf.after(stapel);

    const vonPunkt = new Map(alle.map(l => [l.punkt, l]));

    /* Beim ersten Öffnen die Bilder nachziehen — einmal, danach nie wieder.
       `decoding="async"` hält das Einsetzen aus dem Bild heraus. */
    function bilderNachziehen(l){
      if(l.bilderDa) return;
      l.bilderDa = true;
      l.el.querySelectorAll('.megabar__bild[data-bild]').forEach(k => {
        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        /* Keine width/height-Attribute: die Motive haben verschiedene
           Seitenverhältnisse, und der Kasten steht ohnehin schon
           (`aspect-ratio:4/3` auf `.megabar__bild`). Eine geratene Angabe
           wäre hier eine Falschaussage ohne Nutzen. */
        img.src = k.dataset.bild;
        k.appendChild(img);
        k.removeAttribute('data-bild');
      });
    }

    /* Es ist immer höchstens eine Leiste offen. Daran hängt, dass
       `body.megabar-auf` eine einfache Klasse bleiben kann und kein Zähler
       werden muss. */
    let offen = null;
    function zeigen(l, mitFokus){
      if(offen === l) return;
      if(offen){
        offen.el.classList.remove('auf');
        offen.punkt.setAttribute('aria-expanded', 'false');
      }
      offen = l || null;
      document.body.classList.toggle('megabar-auf', !!offen);
      if(!offen) return;
      bilderNachziehen(offen);
      offen.el.classList.add('auf');
      offen.punkt.setAttribute('aria-expanded', 'true');
      /* Nur bei Tastaturbedienung hineinspringen. Mit der Maus wäre es eine
         Bevormundung: der Zeiger steht ohnehin schon dort.
         Ein Bild später, denn solange `visibility:hidden` noch im
         gerechneten Stil steht, nimmt das Element keinen Fokus an. */
      if(mitFokus) requestAnimationFrame(()=>{
        const erster = offen && offen.el.querySelector('a');
        if(erster) erster.focus();
      });
    }

    /* 120 ms zum Öffnen verschlucken jede Durchfahrt: wer die Navigation nur
       überquert, um zum Anfrage-Knopf zu kommen, löst nichts aus. Beim
       Wechsel von einem Reiter zum nächsten ist die Absicht dagegen schon
       geklärt, deshalb 0. Und 180 ms zum Schließen reichen, weil es keine
       tote Strecke zu überbrücken gibt (siehe Entscheidung 3). */
    const AUF = 120, ZU = 180;
    let uhr = 0;
    /* Nach Escape und nach dem Scrollen bleibt der Reiter gesperrt, bis der
       Zeiger die Zone einmal verlassen hat. Ohne das spränge die Leiste
       unter dem stehenden Zeiger sofort wieder auf, und Escape hätte keine
       sichtbare Wirkung. */
    let sperre = false;

    function planen(ziel, ms){
      clearTimeout(uhr);
      if(ziel === offen) return;
      uhr = setTimeout(()=> zeigen(ziel), ms);
    }

    const feinerZeiger = matchMedia('(hover:hover) and (pointer:fine)');
    if(feinerZeiger.matches){
      /* Ein einziger Zuhörer am Dokument statt je einer an sechs Reitern und
         zwei Leisten. Er beantwortet dieselbe Frage für jeden Ort der Seite:
         bin ich in der Zone, und wenn ja, über welchem Reiter. */
      document.addEventListener('pointerover', (ev)=>{
        /* Ein Finger löst auf manchen Geräten ebenfalls `pointerover` aus,
           unmittelbar vor dem Tippen. Dann öffnete die Leiste und der
           folgende Klick ginge ins Leere. */
        if(ev.pointerType && ev.pointerType !== 'mouse') return;
        const ziel = ev.target;
        if(!ziel || !ziel.closest) return;
        const zone = ziel.closest('header.nav, .megabar');
        if(!zone){ sperre = false; planen(null, ZU); return; }
        /* In der Leiste selbst: offen halten, sonst nichts. */
        if(zone.classList.contains('megabar')){ clearTimeout(uhr); return; }
        const punkt = ziel.closest('.nav__links a');
        const l = punkt ? vonPunkt.get(punkt) : null;
        if(l){ if(!sperre) planen(l, offen ? 0 : AUF); }
        else planen(null, ZU);   /* Wortzeichen, Telefonnummer, Anfrage-Knopf */
      });
      /* Verlässt der Zeiger das Fenster nach oben, kommt kein `pointerover`
         mehr — die Leiste bliebe stehen. */
      document.documentElement.addEventListener('pointerleave', ()=>{
        sperre = false; planen(null, ZU);
      });
    }

    alle.forEach(l => {
      l.punkt.addEventListener('keydown', (ev)=>{
        if(ev.key !== 'ArrowDown') return;
        ev.preventDefault();          /* sonst scrollt die Seite mit */
        sperre = false;
        zeigen(l, true);
      });
      /* Verlässt der Tabulator die Leiste, ist sie erledigt. */
      l.el.addEventListener('focusout', ()=>{
        setTimeout(()=>{
          if(offen === l && !l.el.contains(document.activeElement)
             && document.activeElement !== l.punkt) zeigen(null);
        }, 0);
      });
    });

    document.addEventListener('keydown', (ev)=>{
      if(ev.key !== 'Escape' || !offen) return;
      const punkt = offen.punkt;
      zeigen(null);
      sperre = true;
      punkt.focus();
    });

    /* Ein Klick daneben schließt. Gebraucht wird das für den Weg über die
       Tastatur — mit der Maus erledigt das Wegfahren es schon. */
    document.addEventListener('click', (ev)=>{
      if(offen && !offen.el.contains(ev.target) && !offen.punkt.contains(ev.target))
        zeigen(null);
    });

    addEventListener('scroll', ()=>{
      if(offen){ zeigen(null); sperre = true; }
    }, { passive:true });

    /* Zieht jemand das Fenster unter 981 px, nimmt das Stylesheet die Leiste
       weg — die Klasse `megabar-auf` bliebe aber stehen, und mit ihr der
       deckende Grund der Kopfzeile und ein `aria-expanded="true"` hinter
       einer Leiste, die es nicht mehr gibt. Chromium schiebt unter dem
       stehenden Zeiger meist ein `pointerover` nach, das aufräumt; das ist
       aber ein Zufall der Umschichtung und keine Zusicherung. */
    const schmal = matchMedia('(max-width:980px)');
    const aufraeumen = ()=> zeigen(null);
    if(schmal.addEventListener) schmal.addEventListener('change', aufraeumen);
    else if(schmal.addListener) schmal.addListener(aufraeumen);   /* Safari vor 14 */

    /* Dasselbe im Vollbildmenü, aber nur für die sechs Bereiche: dort ist
       kein Platz für eine Leiste, und die sechs gehören genauso dazu. Sie
       klappen unter dem Menüpunkt auf.

       Jobs bekommt dort bewusst keinen Aufklapper. Am Telefon blendet das
       Stylesheet den Punkt ohnehin aus, weil die Leiste unten „Jobs" schon
       anbietet; auf dem Tablet sind drei Sprungmarken weniger wert als ein
       Tipp auf die Seite. Damit muss `#mobileMenu .menu__unter` im
       Telefon-Block auch nicht aufgeteilt werden. */
    const mPunkt = document.querySelector('#mobileMenu > a[href$="dienstleistungen.html"]');
    if(mPunkt){
      const unter = document.createElement('div');
      unter.className = 'menu__unter';
      unter.id = 'menu-unter';
      unter.innerHTML = BEREICHE.map(([nr, name, datei]) =>
        '<a href="' + vor + 'dienstleistungen/' + datei + '.html">' +
          '<span class="menu__unternum">' + nr + '</span>' + name + '</a>').join('') +
        '<a class="menu__unteralle" href="' + vor + 'dienstleistungen.html">Alle ansehen</a>';
      mPunkt.after(unter);
      mPunkt.setAttribute('aria-expanded', 'false');
      mPunkt.setAttribute('aria-controls', 'menu-unter');
      mPunkt.addEventListener('click', (ev)=>{
        if(ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return;
        ev.preventDefault();
        ev.stopPropagation();          /* nicht das ganze Menue schliessen */
        const auf = mPunkt.getAttribute('aria-expanded') !== 'true';
        mPunkt.setAttribute('aria-expanded', String(auf));
        unter.classList.toggle('auf', auf);
      });
    }
  })();

  /* ---- App-Leiste ----
     Ein Tipp auf den Reiter, auf dem man ohnehin schon steht, lädt die
     Seite in einer Anwendung nicht neu — er springt nach oben. Genau das
     tut er hier auch. Ohne das wäre der halbe Nutzen des Reiters weg: auf
     einer Seite von dreizehn Bildschirmhöhen ist „wieder ganz nach oben"
     der häufigste Wunsch. */
  const appleiste = document.querySelector('.appleiste');
  if(appleiste){
    appleiste.addEventListener('click', (ev)=>{
      const a = ev.target.closest('a');
      if(!a || a.getAttribute('aria-current') !== 'page') return;
      ev.preventDefault();
      window.scrollTo({ top:0, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  /* Solange gescrollt wird, tritt die Leiste zurück und gibt das Bild frei;
     kommt das Scrollen zur Ruhe, steht sie wieder da. Was das heißt, steht
     im Stylesheet unter `.appleiste.faehrt`.

     Der Zustand wird nur bei echtem Wechsel geschrieben — sonst liefe bei
     jedem Scrollbild eine Klassenänderung, und die Leiste wäre selbst zur
     Bremse geworden, die sie verhindern soll. */
  let leisteZeit, leisteFaehrt = false;
  function leisteScrollt(){
    if(!appleiste) return;
    if(!leisteFaehrt){ leisteFaehrt = true; appleiste.classList.add('faehrt'); }
    clearTimeout(leisteZeit);
    leisteZeit = setTimeout(()=>{
      leisteFaehrt = false;
      appleiste.classList.remove('faehrt');
    }, 520);
  }

  /* Eintritte beim Scrollen. Gruppen mit data-stagger bekommen pro Kind einen
     Index, damit sie nacheinander statt gleichzeitig erscheinen — das gibt dem
     Abschnitt einen Takt, statt alles auf einen Schlag zu zeigen. */
  document.querySelectorAll('[data-stagger]').forEach(gruppe=>{
    [...gruppe.children].forEach((kind, i)=> kind.style.setProperty('--i', i));
  });
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      /* Zwei Fälle decken alles ab: das Element kommt herein — oder es liegt
         beim ersten Bescheid bereits vollständig oberhalb des Fensters. Der
         zweite Fall tritt auf, wenn jemand über einen Sprunganker einsteigt,
         tief in der Seite neu lädt oder sehr schnell scrollt. Ohne ihn bliebe
         der übersprungene Abschnitt dauerhaft unsichtbar, weil er nie wieder
         von unten hereinkommt. */
      if(e.isIntersecting || e.boundingClientRect.bottom < 0){
        aufdecken(e.target);
      }
    });
  }, { threshold:.16, rootMargin:'0px 0px -8% 0px' });

  /* Wer noch wartet. Wird gebraucht, weil ein Element, das der Browser beim
     schnellen Ziehen am Rollbalken komplett überspringt, gar keinen Bescheid
     auslöst — der Beobachter meldet nur Übergänge, und ein Übergang, der
     zwischen zwei Bildern stattfindet, kann verloren gehen. */
  const wartend = new Set();
  function aufdecken(el){
    el.classList.add('in');
    io.unobserve(el);
    wartend.delete(el);
  }
  /* .foot__claim hängt mit dran: die Schlusszeile des Fußes läuft aus ihren
     Masken nach oben, sobald sie hereinkommt — dieselbe Geste wie im Hero,
     nur nicht zeitgesteuert. Sie trägt bewusst nicht .reveal-up: das wären
     zwei Bewegungen auf derselben Zeile. */
  document.querySelectorAll('.reveal-up, [data-stagger], .foot__claim').forEach(el=>{
    wartend.add(el);
    io.observe(el);
  });

  /* Nachlese, sobald das Scrollen zur Ruhe kommt: alles, was inzwischen
     oberhalb des Fensters liegt, wurde übersprungen und wird aufgedeckt.
     Läuft nur beim Stillstand, kostet also im Betrieb nichts. */
  let nachleseZeit;
  function nachlese(){
    if(!wartend.size) return;
    for(const el of [...wartend]){
      if(el.getBoundingClientRect().bottom < 0) aufdecken(el);
    }
  }

  /* Hochzählende Kennzahlen und die violetten Leuchtkugeln im Hero sind
     entfallen — mit ihnen der mousemove-Listener, der bei jeder Mausbewegung
     transform auf drei großflächig weichgezeichnete Elemente schrieb. */

  /* ---- Cinematic scroll-zoom for each stage ----
     Am Telefon läuft die Kamerafahrt nicht. Sie besteht aus zwei
     bildschirmfüllenden Fotos übereinander, deren Maßstab und Deckkraft
     sich in jedem Bild ändern — sechsmal hintereinander. Genau daran hat
     das Scrollen auf `dienstleistungen.html` gehakt.

     Was hier entschieden wird, ist nur, ob die drei Werte überhaupt
     geschrieben werden. Wie die Bühne dann aussieht, steht im Stylesheet
     (Abschnitt „Die Bühnen am Telefon"). Der Wert wird einmal gelesen und
     nicht laufend nachgeprüft: wer sein Fenster von 900 auf 1400 Pixel
     zieht, bekommt die Fahrt beim nächsten Aufruf. */
  const schmal = window.matchMedia('(max-width:980px)');
  const sparsam = schmal.matches;

  const clamp = (v,a,b)=> Math.max(a, Math.min(b,v));
  const smooth = (a,b,x)=>{ const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  /* Elemente einmal auflösen statt in jedem Frame. Vorher liefen pro Bild vier
     querySelector je Bühne — bei sechs Bühnen 24 DOM-Abfragen pro Frame, was
     beim Scrollen sichtbar geruckelt hat. */
  const stages = [...document.querySelectorAll('.stage')].map(st => ({
    el:     st,
    scene:  st.querySelector('.scene'),
    detail: st.querySelector('.detail'),
    panel:  st.querySelector('.panel'),
    door:   st.querySelector('.door'),
    last:   { zoom:null, detail:null, panel:null, door:null, kapitel:null },
    oben:   undefined, unten: undefined, live: null,
  }));

  /* Nur schreiben, wenn sich der Wert wirklich geändert hat — jedes
     setProperty stößt sonst unnötig Style- und Compositing-Arbeit an. */
  function set(st, el, key, value){
    if(!el || st.last[key] === value) return;
    st.last[key] = value;
    el.style.setProperty('--' + key, value);
  }

  /* ---- Erst messen, dann schreiben ----
     Vorher las jede der drei Schleifen ihre Rechtecke, schrieb ihre Werte und
     die nächste las wieder. Jedes Schreiben macht das Layout ungültig, jedes
     folgende Lesen erzwingt es neu — pro Bild also mehrfach ein komplettes
     Layout über eine Seite von fünfzehn Bildschirmhöhen. Genau das hat sich
     als Ruckeln bemerkbar gemacht.

     Jetzt sammelt `messen()` alle Rechtecke in einem Zug; erst danach wird
     geschrieben. Der Browser rechnet das Layout dann einmal statt viermal. */
  function messen(){
    const vh = window.innerHeight;
    for(const st of stages){
      const rect = st.el.getBoundingClientRect();
      st.oben = rect.top; st.unten = rect.bottom;
      st.hoehe = st.el.offsetHeight;
      st.p = clamp((-rect.top) / (st.hoehe - vh), 0, 1);
      st.sichtbar = rect.top < vh * 1.2 && rect.bottom > -vh * 0.2;
    }
    for(const s of spuren){
      const r = s.el.getBoundingClientRect();
      const h = Math.max(1, r.height);
      s.sichtbar = r.top < vh * 1.2 && r.bottom > -vh * 0.2;
      s.p = s.art === 'weg'
        ? clamp(-r.top / h, 0, 1)               // 0 = steht noch, 1 = ganz oben raus
        : clamp((vh - r.top) / (vh + h), 0, 1); // 0 = kommt unten herein, 1 = oben hinaus
    }
  }

  function updateStages(){
    for(const st of stages){
      const p = st.p;
      /* Nur die Bühne, die gerade zu sehen ist, wird zur eigenen Ebene.
         `will-change` an allen sechs hieße: zwölf bildschirmfüllende Fotos
         gleichzeitig im Grafikspeicher. Auf einem 1440er Bildschirm sind das
         über 200 MB — der Compositor wirft dann Kacheln weg und legt sie neu
         an, und genau das ist das Ruckeln. Die Klasse steht im Stylesheet
         vor jedem `will-change` der Bühne. */
      /* Beim Verlassen des Bildes wird noch **einmal** geschrieben, danach
         nicht mehr. Ohne dieses letzte Mal bliebe die Buehne auf dem Wert
         stehen, den sie beim Hinausrollen hatte — und zeigte beim
         Zurueckkommen fuer ein Bild den alten Zustand. */
      const warLive = st.live;
      if(st.live !== st.sichtbar){
        st.live = st.sichtbar;
        st.el.classList.toggle('live', st.sichtbar);
      }
      if(!st.sichtbar && !warLive) continue;
      if(!sparsam){
        /* Annäherung, nicht Aufziehen: das Foto füllt die Bühne bereits (siehe
           .scene__frame im Stylesheet), deshalb genügt eine ruhige Fahrt von
           1 auf 1,42. Der frühere Faktor 1,7 stammt aus der Zeit, als die Szene
           als 560-px-Quadrat begann und über den Bildschirm wachsen musste. */
        set(st, st.scene,  'zoom',   (1 + p*0.42).toFixed(3));
        // detail (interior/closeup) cross-fades in
        set(st, st.detail, 'detail', smooth(0.34, 0.62, p).toFixed(3));
        // panel reveals last
        set(st, st.panel,  'panel',  smooth(0.5, 0.82, p).toFixed(3));
      }
      // Tür/Tor zuerst: der Spalt ist offen, bevor die Kamera ernsthaft
      // hineinfährt — sonst liest der Wechsel als Schnitt statt als Öffnen.
      set(st, st.door,   'door',   smooth(0.02, 0.24, p).toFixed(3));
      /* Der Fortschritt der Bühne selbst — Kapitelmarke, Fortschrittslinie
         und die Blende am Bühnenrand hängen daran. Eigenschaften erben,
         deshalb genügt es, ihn einmal oben an der Bühne zu setzen. */
      set(st, st.el,     'kapitel', p.toFixed(3));
    }
  }

  /* ---- Wort für Wort ----
     Eine Zeile, die beim Scrollen Wort für Wort entsteht, statt fertig
     dazustehen. Das Zerlegen passiert hier, die Bewegung im Stylesheet:
     jedes Wort bekommt seinen Index als --n, die Zeile ihre Anzahl als
     --anz, und daraus rechnet CSS den eigenen Startpunkt jedes Wortes.

     Die Leerzeichen bleiben echte Textknoten zwischen den Spans. Ohne sie
     liest ein Vorlesewerkzeug die Zeile ohne Pausen als ein einziges Wort,
     und markierter Text liesse sich nicht mehr sinnvoll kopieren.

     Ohne Motor (reduzierte Bewegung, kein JavaScript) bleibt --lauf leer;
     der Vorgabewert im Stylesheet ist deshalb 1, also „alles sichtbar". */
  document.querySelectorAll('[data-worte]').forEach(el => {
    const worte = el.textContent.trim().split(/\s+/);
    if(worte.length < 2) return;
    el.textContent = '';
    worte.forEach((w, i) => {
      const huelle = document.createElement('span');
      huelle.className = 'wort';
      huelle.style.setProperty('--n', i);
      const innen = document.createElement('span');
      innen.textContent = w;
      huelle.appendChild(innen);
      el.appendChild(huelle);
      if(i < worte.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.style.setProperty('--anz', worte.length);
  });

  /* ============================================================
     Motion-Motor
     ------------------------------------------------------------
     Bewegung soll vom Scrollen geführt werden, nicht von Zeit. Statt
     jedem Effekt einen eigenen Beobachter zu geben, schreibt eine
     einzige Schleife zwei Zahlen an angemeldete Elemente:

       --weg   wie weit der Abschnitt nach oben hinausgelaufen ist
       --lauf  wie weit das Element durch das Fenster gewandert ist

     Was daraus wird, entscheidet allein das Stylesheet. Gerechnet wird
     nur mit getBoundingClientRect (kein Layout-Zwang beim Lesen im
     rAF), geschrieben nur bei echter Änderung — sonst stößt jedes
     setProperty Style-Arbeit für nichts an.
     ============================================================ */
  /* ---- Die Einsatzlinie ----------------------------------------------
     Das eine Zeichen, das sich durch die ganze Website zieht.

     Die Seite trennt ihre Abschnitte ohnehin durch eine Haarlinie über die
     volle Breite. Genau diese Linie bekommt eine Position: ein kurzes helles
     Stück mit einem Punkt an der Spitze, das beim Scrollen von links nach
     rechts wandert. Wie weit, sagt `--lauf` — dieselbe Zahl, die auch die
     Bilder führt.

     Warum das und nicht ein Muster oder ein Raster: das Unternehmen stellt
     Menschen an Positionen. Punkt und Linie sind dafür das knappste Bild,
     das es gibt, und die Linie war ohnehin schon da. Es kommt also nichts
     hinzu, was vorher nicht da war — es bekommt nur eine Richtung.

     Angemeldet wird hier statt im Markup: die Linie ist Zierde, und Zierde
     gehört nicht in sechzehn Dateien geschrieben. Ausgenommen ist alles,
     was schon eine eigene Bewegung hat (Bühnen, Kopfbilder), und alles,
     was zu schmal ist, um eine Fahrt zu zeigen. */
  if(!reduce){
    const KEINE_SPUR = '.stage, .hero, .subhero, .schritt, .tcard, .ccard, .trust__item, .feld';
    document.querySelectorAll(
      '.ablauf, .expect, .cta, .testi, .section-soft, .content, body > footer'
    ).forEach(el => {
      if(el.closest(KEINE_SPUR) || el.hasAttribute('data-lauf')) return;
      const cs = getComputedStyle(el);
      /* Nur dort, wo wirklich eine Haarlinie oben sitzt — sonst schwebte
         das Zeichen im Nichts. */
      if(parseFloat(cs.borderTopWidth) < 0.5) return;
      el.setAttribute('data-spur', '');
      el.setAttribute('data-lauf', '');
    });
  }

  const spuren = [];
  if(!reduce){
    document.querySelectorAll('[data-weg]').forEach(el => spuren.push({ el, art:'weg',  wert:null, live:null }));
    document.querySelectorAll('[data-lauf]').forEach(el => spuren.push({ el, art:'lauf', wert:null, live:null }));
  }

  function updateMotion(){
    for(const s of spuren){
      /* Dasselbe wie bei den Bühnen: nur was zu sehen ist, wird zur eigenen
         Ebene und bekommt überhaupt einen neuen Wert. Sechs bildschirm-
         füllende Szenen dauerhaft im Grafikspeicher zu halten, kostet mehr
         als die Fahrt selbst. */
      const warLive = s.live;
      if(s.live !== s.sichtbar){
        s.live = s.sichtbar;
        s.el.classList.toggle('live', s.sichtbar);
      }
      if(!s.sichtbar && !warLive) continue;   // letzter Wert schon geschrieben
      const w = s.p.toFixed(3);
      if(s.wert !== w){ s.wert = w; s.el.style.setProperty('--' + s.art, w); }
    }
  }

  /* ---- Kinofassung und Kapitelrail ----
     Beide gehören zum Bühnenblock als Ganzem, nicht zu einer einzelnen
     Bühne. Würde jede Bühne ihre eigenen Balken einfahren, klappten sie
     bei jedem Übergang zu und wieder auf. Deshalb ein Wert über den
     ganzen Block: Anfang der ersten bis Ende der letzten Bühne. */
  const kino = document.querySelector('.kino');
  let rail = null, railLinks = [], railAktiv = -1, railAn = null, kinoWert = null;

  /* Der obere Kinobalken muss die feste Navigationsleiste überbrücken,
     sonst liegt er unsichtbar dahinter, und die Kapitelmarke muss unter
     ihm anfangen. Ihre Höhe hängt an der Breite, deshalb wird sie gemessen
     und global hinterlegt statt geraten. */
  function navHoehe(){
    if(!nav) return;
    document.documentElement.style.setProperty(
      '--nav-h', Math.round(nav.getBoundingClientRect().height) + 'px');
  }

  if(!reduce && stages.length > 1){
    /* In der Einzeldatei-Vorschau laeuft dieser Code bei jedem Seitenwechsel
       erneut. Ohne das Aufraeumen stapelten sich die Rails uebereinander. */
    const alteRail = document.querySelector('body > .kapitel');
    if(alteRail) alteRail.remove();
    rail = document.createElement('nav');
    rail.className = 'kapitel';
    rail.setAttribute('aria-label', 'Dienstleistungen auf dieser Seite');
    stages.forEach((st, i)=>{
      const marke = st.el.querySelector('.stage__index');
      const name = marke ? (marke.querySelector('.stage__titel') || marke).textContent.trim()
                         : (st.el.dataset.stage || '');
      const a = document.createElement('a');
      a.href = '#' + st.el.id;
      a.innerHTML = '<span></span>' + String(i + 1).padStart(2, '0');
      a.querySelector('span').textContent = name;
      rail.appendChild(a);
    });
    document.body.appendChild(rail);
    railLinks = [...rail.querySelectorAll('a')];
  }

  function updateKino(){
    if(!stages.length || (!kino && !rail)) return;
    const vh = window.innerHeight;
    const oben  = stages[0].oben;
    const unten = stages[stages.length - 1].unten;
    if(oben === undefined) return;   // updateStages() laeuft immer zuerst
    /* auf, sobald die erste Bühne das Fenster füllt; zu, sobald die letzte
       es verlässt. Dazwischen liegt der Wert konstant auf 1. */
    const k = Math.min(smooth(0.18, 0.9, (vh - oben) / vh),
                       smooth(0.18, 0.9, unten / vh));
    const w = k.toFixed(3);
    if(kino && kinoWert !== w){ kinoWert = w; kino.style.setProperty('--kino', w); }

    if(rail){
      const an = k > 0.5;
      if(railAn !== an){ railAn = an; rail.classList.toggle('sichtbar', an); }
      if(an){
        /* aktiv ist die Bühne, deren Mitte dem Fenstermittelpunkt am
           nächsten liegt — robuster als „erste sichtbare", weil sich bei
           230vh hohen Bühnen fast immer zwei überlappen. */
        let beste = 0, dist = Infinity;
        stages.forEach((st, i)=>{
          const d = Math.abs((st.oben + st.unten) / 2 - vh / 2);
          if(d < dist){ dist = d; beste = i; }
        });
        if(railAktiv !== beste){
          if(railLinks[railAktiv]) railLinks[railAktiv].classList.remove('ist');
          railLinks[beste].classList.add('ist');
          railAktiv = beste;
        }
      }
    }
  }

  /* ---- Video-Szenen ----
     Laden und Abspielen nur im Viewport. Auf Mobil, bei Datensparmodus und bei
     prefers-reduced-motion bleibt es beim Poster — src wird dann gar nicht gesetzt.
     updateStages() bleibt unverändert; die Videos lesen nur die Variablen mit,
     die dort ohnehin schon gesetzt werden. */
  const vids = [...document.querySelectorAll('.stagevid')];
  const posterOnly = ()=> reduce
    || window.matchMedia('(max-width:980px)').matches
    || !!(navigator.connection && navigator.connection.saveData);

  vids.forEach(v=>{
    /* Videoebene erst einblenden, wenn wirklich etwas zu sehen ist.
       scrubVideos() muss hier nachziehen: der Clip lädt erst beim Betreten der
       Bühne, und wer dann nicht weiterscrollt, bekäme sonst dauerhaft Frame 0. */
    v.addEventListener('loadeddata', ()=>{ v.classList.add('ready'); scrubVideos(); });
    if(v.getAttribute('poster')){
      const probe = new Image();
      probe.onload = ()=> v.classList.add('ready');
      probe.src = v.getAttribute('poster');
    }
  });

  if(vids.length){
    const vio = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        const v = e.target;
        if(e.isIntersecting){
          if(!v.src && v.dataset.src && !posterOnly()) v.src = v.dataset.src;
          /* gescrubbte Clips laufen nicht von selbst — der Scroll führt sie */
          if(v.hasAttribute('data-scrub') || posterOnly()) return;
          if(v.src) v.play().catch(()=>{});
        } else if(!v.paused){
          v.pause();
        }
      });
    }, { rootMargin:'200px 0px', threshold:0 });
    vids.forEach(v=> vio.observe(v));
  }

  /* Scroll-gescrubbte Clips: --door (0→1) wird auf die Laufzeit abgebildet */
  const scrubbers = vids.filter(v=> v.hasAttribute('data-scrub'));
  function scrubVideos(){
    for(const v of scrubbers){
      if(v.readyState < 2 || !v.duration) continue;
      const p = parseFloat(v.style.getPropertyValue('--door')) || 0;
      const t = p * Math.max(0, v.duration - 0.05);
      if(Math.abs(v.currentTime - t) > 0.03) v.currentTime = t;
    }
  }

  /* ---- Imagefilm ----
     Läuft in Schleife, stumm, und lädt erst, wenn der Abschnitt in Sicht kommt.
     Die Untertitel zeichnen wir selbst: die Browser-Darstellung von <track> ist
     je nach Gerät unterschiedlich groß, sitzt mal im, mal unter dem Bild und
     ist auf hellen Szenen schlecht lesbar. Die Spur bleibt trotzdem eine echte
     WebVTT-Datei — Vorlesewerkzeuge und der Austausch des Films hängen daran. */
  (function(){
    const film  = document.querySelector('.film__video');
    if(!film) return;
    const buehne = film.closest('.film__buehne');
    const zeile  = buehne && buehne.querySelector('.film__untertitel');
    const btnPlay = buehne && buehne.querySelector('[data-film-abspielen]');
    const btnTon  = buehne && buehne.querySelector('[data-film-ton]');
    const sparsam = !!(navigator.connection && navigator.connection.saveData);
    /* Bei reduzierter Bewegung und im Datensparmodus bleibt es beim Poster,
       bis jemand selbst auf Abspielen drückt. */
    const vonSelbst = !reduce && !sparsam;
    let vomNutzerPausiert = !vonSelbst;

    function knopfStand(){
      if(!btnPlay) return;
      const laeuft = !film.paused;
      btnPlay.querySelector('span').textContent = laeuft ? 'Pause' : 'Abspielen';
      btnPlay.setAttribute('aria-label', laeuft ? 'Film pausieren' : 'Film abspielen');
      btnPlay.classList.toggle('film__knopf--laeuft', laeuft);
    }

    /* Eine grössere Fassung des Films wurde gebaut und wieder verworfen: die
       Fotos, aus denen er besteht, haben 1129 bis 1600 px, 1920 liegt also
       schon über der Vorlage. Gemessen war 2560 exakt gleich gut und doppelt
       so schwer. Liegt einmal echtes Material vor, kommt `data-src-gross`
       zurück — dann lohnt es sich. */
    function quelleSetzen(){
      if(film.src || !film.dataset.src) return;
      const weit = window.matchMedia('(min-width:981px)').matches;
      const knausrig = !!(navigator.connection && navigator.connection.saveData);
      film.src = (weit && !knausrig && film.dataset.srcGross) || film.dataset.src;
    }

    /* Das scharfe Vorschaubild wiegt gut das Doppelte des kleinen. Es wird
       deshalb erst geholt, wenn der Abschnitt in die Nähe kommt — wer nie so
       weit scrollt, lädt es nie. Erst wenn es vollständig da ist, wird
       getauscht; sonst blitzt für einen Moment gar kein Bild auf.
       Ohne JavaScript bleibt das kleine stehen. Das ist richtig so: ohne
       JavaScript läuft auch der Film nicht, das Vorschaubild ist dann alles,
       was der Abschnitt zeigt. */
    if(film.dataset.poster && 'IntersectionObserver' in window){
      const pio = new IntersectionObserver((eintraege, beob)=>{
        if(!eintraege.some(e=> e.isIntersecting)) return;
        beob.disconnect();
        const gross = new Image();
        gross.onload = ()=>{ if(!film.currentTime) film.poster = film.dataset.poster; };
        gross.src = film.dataset.poster;
      }, { rootMargin:'200% 0px' });
      pio.observe(film);
    }

    /* Untertitel */
    const spurEl = film.querySelector('track');
    function spurUebernehmen(){
      const spur = spurEl && spurEl.track;
      if(!spur || !zeile) return false;
      spur.mode = 'hidden';               // wir zeichnen selbst
      if(!spur.cues || !spur.cues.length) return false;
      spur.addEventListener('cuechange', ()=>{
        const aktiv = spur.activeCues;
        const text = aktiv && aktiv.length
          ? [...aktiv].map(c=> c.text).join(' ').replace(/<[^>]+>/g,'')
          : '';
        zeile.textContent = text;
        zeile.classList.toggle('an', !!text);
      });
      return true;
    }
    if(!spurUebernehmen() && spurEl){
      spurEl.addEventListener('load', spurUebernehmen, { once:true });
      /* Safari meldet den Ladevorgang nicht immer über load — einmal nachfassen */
      setTimeout(spurUebernehmen, 1200);
    }

    /* ---- Ton ----
       Der Film soll mit Ton starten. Genau das erlauben Browser aber nicht:
       ein Video, das von selbst anläuft, muss stumm sein — sonst wird es gar
       nicht erst abgespielt (Chrome, Safari, Firefox gleichermaßen; auf dem
       iPhone ausnahmslos). Deshalb dieser Ablauf:

         1. Erst unstumm versuchen. Erlaubt der Browser es, läuft der Film
            sofort mit Ton — der Wunschzustand.
         2. Wird es abgelehnt, läuft er stumm weiter und der Tonschalter tritt
            sichtbar hervor. Ein Antippen genügt.
         3. Sobald der Besucher irgendwo auf der Seite klickt oder tippt, gilt
            das als Zustimmung: dann wird der Ton noch einmal versucht.
         4. Wer den Ton bewusst ausschaltet, bekommt ihn nicht wieder
            aufgedrängt — auch nicht auf der nächsten Seite. */
    const TON_SCHLUESSEL = 'hst-ton';
    let tonGewollt = true;                       // Vorgabe: Ton an
    try {
      if(sessionStorage.getItem(TON_SCHLUESSEL) === 'aus') tonGewollt = false;
    } catch(e){}

    function tonStand(){
      if(!btnTon) return;
      const an = !film.muted;
      btnTon.querySelector('span').textContent = an ? 'Ton aus' : 'Ton an';
      btnTon.setAttribute('aria-label', an ? 'Ton ausschalten' : 'Ton einschalten');
      btnTon.setAttribute('aria-pressed', String(an));
      /* Ist Ton gewollt, aber vom Browser noch nicht erlaubt, hebt sich der
         Schalter hervor — sonst übersieht man ihn. */
      btnTon.classList.toggle('film__knopf--wartet', !an && tonGewollt);
    }

    /* Versucht abzuspielen; erst mit Ton, bei Ablehnung stumm. */
    async function abspielen(){
      quelleSetzen();
      if(tonGewollt && film.muted){
        film.muted = false;
        try {
          await film.play();
          knopfStand(); tonStand();
          return;
        } catch(e){
          film.muted = true;               // Browser hat abgelehnt
        }
      }
      try { await film.play(); } catch(e){}
      knopfStand(); tonStand();
    }

    /* Erste Berührung mit der Seite zählt als Zustimmung — danach lassen
       Browser den Ton zu. */
    if(btnTon){
      const nachfassen = ()=>{
        if(tonGewollt && film.muted && !film.paused){
          film.muted = false;
          film.play().catch(()=>{ film.muted = true; }).finally(tonStand);
        }
      };
      ['pointerdown','keydown','touchstart'].forEach(art =>
        window.addEventListener(art, nachfassen, { once:true, passive:true }));
    }

    /* Nur im Viewport laufen lassen */
    const fio = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          if(vonSelbst && !vomNutzerPausiert) abspielen();
        } else if(!film.paused){
          film.pause();
          knopfStand();
        }
      });
    }, { threshold:.25 });
    fio.observe(film);

    if(btnPlay){
      btnPlay.addEventListener('click', ()=>{
        if(film.paused){
          vomNutzerPausiert = false;
          abspielen();
        } else {
          vomNutzerPausiert = true;
          film.pause();
        }
        knopfStand();
      });
    }
    film.addEventListener('play', knopfStand);
    film.addEventListener('pause', knopfStand);
    film.addEventListener('volumechange', tonStand);

    /* Tonschalter. Er erscheint nur, wenn der Film wirklich eine Tonspur hat —
       sonst wäre der Knopf eine Lüge. */
    if(btnTon){
      if(film.hasAttribute('data-ohne-ton')){
        btnTon.remove();
      } else {
        btnTon.hidden = false;
        btnTon.addEventListener('click', ()=>{
          tonGewollt = film.muted;                 // umschalten
          film.muted = !film.muted;
          try { sessionStorage.setItem(TON_SCHLUESSEL, tonGewollt ? 'an' : 'aus'); } catch(e){}
          if(tonGewollt && film.paused) abspielen();
          tonStand();
        });
        tonStand();
      }
    }

    knopfStand();
  })();

  /* Hier stand der Uebergang von einer Szene der Startseite auf ihre
     Detailseite. Die Szenen gibt es nicht mehr — der Weg fuehrt jetzt
     ueber den Balken unter der Kopfzeile. */

  /* ---- Galerie-Lightbox ----
     <dialog> statt eigenem Overlay: Fokusfalle, Escape und der Rückweg zum
     auslösenden Element kommen damit vom Browser. Weiterblättern mit den
     Pfeiltasten, weil man in einer Galerie genau das versucht. */
  (function(){
    const dlg = document.getElementById('lightbox');
    const kacheln = [...document.querySelectorAll('.gal__item')];
    if(!dlg || !kacheln.length || typeof dlg.showModal !== 'function') return;

    const bild    = dlg.querySelector('.lightbox__bild');
    const bu      = dlg.querySelector('.lightbox__bu-text');
    const zaehler = dlg.querySelector('.lightbox__zaehler');
    let index = 0;

    function zeigen(i){
      index = (i + kacheln.length) % kacheln.length;
      const quelle = kacheln[index].querySelector('img');
      const text   = kacheln[index].querySelector('figcaption');
      /* Die Kachel zeigt eine verkleinerte Fassung; in der Lightbox soll die
         volle Auflösung stehen, falls eine hinterlegt ist. */
      bild.src = kacheln[index].dataset.gross || quelle.src;
      bild.alt = quelle.alt || '';
      bu.textContent = text ? text.textContent.trim() : '';
      zaehler.textContent = (index+1) + ' / ' + kacheln.length;
    }

    kacheln.forEach((k, i)=>{
      k.addEventListener('click', (ev)=>{ ev.preventDefault(); zeigen(i); dlg.showModal(); });
    });
    dlg.querySelector('.lightbox__zu').addEventListener('click', ()=> dlg.close());
    dlg.querySelector('.lightbox__vor').addEventListener('click', ()=> zeigen(index+1));
    dlg.querySelector('.lightbox__zurueck').addEventListener('click', ()=> zeigen(index-1));
    dlg.addEventListener('keydown', (ev)=>{
      if(ev.key === 'ArrowRight') zeigen(index+1);
      if(ev.key === 'ArrowLeft')  zeigen(index-1);
    });
    /* Klick auf den dunklen Grund schließt — aber nur dort, nicht auf dem Bild. */
    dlg.addEventListener('click', (ev)=>{ if(ev.target === dlg) dlg.close(); });
  })();

  /* ---- Formulare ----
     Ein Formular ist das Ziel der ganzen Seite. Es muss deshalb vier Dinge
     können: prüfen, verständlich meckern, absenden und bestätigen.

     Übermittlung, in dieser Reihenfolge:
       0. /api/formular             -> die eigene Funktion; sie baut aus den
                                       Angaben ein PDF und schickt es ans Büro
       1. data-endpunkt="https://…"  -> dorthin (Formspree, eigenes Backend)
       2. data-netlify="true"        -> POST auf "/" (Netlify Forms, ohne Konto-
                                        schlüssel; Netlify liest das Formular
                                        beim Deploy aus dem HTML)
       3. sonst                      -> Meldung mit Telefonnummer und Adresse.
                                       Die Seite schickt niemanden in sein
                                       Mailprogramm — weder von selbst noch
                                       über einen Link.
     Jede Stufe reicht an die nächste weiter, wenn es sie an dieser Adresse
     nicht gibt. Geht dagegen etwas wirklich schief, wird das nicht still-
     schweigend verschluckt: es erscheint eine Fehlermeldung mit Telefonnummer
     und ein Mail-Ersatzweg.

     Spam-Schutz ohne Captcha: ein unsichtbares Feld (Honigtopf), das nur
     Maschinen ausfüllen, plus eine Mindestzeit zwischen Laden und Absenden.
     Beides kostet echte Besucher nichts. */
  /* „Bewerben" an einer Stelle springt nicht nur zum Formular, sondern trägt
     den Bereich gleich ein — sonst muss man ihn zwei Zeilen später noch einmal
     auswählen. */
  document.querySelectorAll('[data-bereich-waehlen]').forEach(knopf => {
    knopf.addEventListener('click', () => {
      const wahl = knopf.dataset.bereichWaehlen;
      const feld = document.querySelector('#bewerbung select[name="Bereich"]');
      if(!feld) return;
      const treffer = [...feld.options].find(o => o.value === wahl || o.text === wahl);
      if(treffer){
        feld.value = treffer.value || treffer.text;
        feld.dispatchEvent(new Event('change', { bubbles:true }));
      }
    });
  });

  document.querySelectorAll('form[data-formular]').forEach(form => {
    const status     = form.querySelector('.form__status');
    const knopf      = form.querySelector('button[type="submit"]');
    const empfaenger = form.dataset.empfaenger || 'info@hermserviceteam.com';
    const honigtopf  = form.querySelector('.honigtopf input');
    const geladen    = Date.now();
    /* Zeitsperre gegen Bots, aber bewusst weich: wer per Autovervollständigung
       ausfüllt, ist realistisch in zwei Sekunden fertig. Eine harte Sperre
       würde solche Anfragen stillschweigend wegwerfen — das wäre schlimmer als
       eine Spam-Mail. Deshalb wird beim ersten Mal nur nachgefragt. */
    const MINDESTZEIT = 2500;   // ms
    let schnellBestaetigt = false;

    /* --- Meldungen --- */
    function melden(text, stand){
      if(!status) return;
      status.textContent = text || '';
      if(stand) status.dataset.stand = stand; else delete status.dataset.stand;
    }

    /* --- Prüfung eines einzelnen Feldes --- */
    function textZu(feld){
      const v = feld.validity;
      if(v.valueMissing){
        if(feld.type === 'checkbox') return 'Bitte bestätigen, damit wir Ihre Anfrage bearbeiten dürfen.';
        if(feld.tagName === 'SELECT') return 'Bitte einen Eintrag wählen.';
        return 'Bitte ausfüllen.';
      }
      if(v.typeMismatch && feld.type === 'email') return 'Bitte eine gültige E-Mail-Adresse angeben, z. B. name@firma.de';
      if(v.typeMismatch && feld.type === 'tel')   return 'Bitte eine gültige Telefonnummer angeben.';
      if(v.tooShort)  return 'Bitte etwas ausführlicher: mindestens ' + feld.minLength + ' Zeichen.';
      if(v.tooLong)   return 'Das ist zu lang: höchstens ' + feld.maxLength + ' Zeichen.';
      if(v.patternMismatch) return feld.dataset.fehler || 'Diese Eingabe passt nicht ins Format.';
      if(v.rangeUnderflow || v.rangeOverflow) return feld.dataset.fehler || 'Dieser Wert liegt außerhalb des erlaubten Bereichs.';
      if(v.badInput) return 'Diese Eingabe können wir nicht lesen.';
      return 'Bitte prüfen Sie diese Eingabe.';
    }

    function pruefen(feld){
      const huelle = feld.closest('.feld') || feld.parentElement;
      const meldung = huelle && huelle.querySelector('.feld__fehler');
      const ok = feld.checkValidity();
      if(huelle) huelle.classList.toggle('feld--fehler', !ok);
      feld.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if(meldung) meldung.textContent = ok ? '' : textZu(feld);
      return ok;
    }

    /* ---- Felder, die nur zu einer bestimmten Auswahl gehören ----
       „Anderer Bereich" im Auswahlfeld blendet ein Textfeld ein, in das
       das Unternehmen selbst schreiben kann, worum es geht. Solange es
       nicht gebraucht wird, ist es nicht nur unsichtbar, sondern über
       disabled auch aus Prüfung und Übermittlung genommen — sonst stünde
       in jeder Mail eine leere Zeile.

       Ohne JavaScript bleibt das Feld sichtbar und freiwillig: eine Zeile
       mehr im Formular ist verkraftbar, ein fehlendes Feld nicht. */
    form.querySelectorAll('[data-wenn]').forEach(huelle => {
      const quelle = form.querySelector('#' + huelle.dataset.wenn);
      const feld   = huelle.querySelector('input, select, textarea');
      const wert   = huelle.dataset.wennWert;
      if(!quelle || !feld) return;

      /* Ein Häkchen schaltet über seinen Zustand, ein Auswahlfeld über
         seinen Wert. Beides landet hier, damit im Markup dieselben zwei
         Attribute reichen — data-wenn und data-wenn-wert. */
      const haken = quelle.type === 'checkbox';
      /* Freiwillige Felder bleiben freiwillig, auch wenn sie erscheinen.
         „Welcher Bereich?" ist eine Pflichtangabe, die Rechnungsanschrift
         nicht. Das entscheidet data-wenn-pflicht am umgebenden Feld — und
         nicht diese Funktion. */
      const pflicht = huelle.hasAttribute('data-wenn-pflicht');

      function stand(){
        const an = haken ? quelle.checked : quelle.value === wert;
        huelle.hidden   = !an;
        feld.disabled   = !an;
        feld.required   = an && pflicht;
        if(an) return;
        feld.value = '';
        huelle.classList.remove('feld--fehler');
        feld.setAttribute('aria-invalid', 'false');
        const meldung = huelle.querySelector('.feld__fehler');
        if(meldung) meldung.textContent = '';
      }
      quelle.addEventListener('change', stand);
      stand();
    });

    /* ---- Einsatzzeitraum ----
       Personal wird oft nicht für einen Tag gebraucht, sondern für einen
       Aufbau über eine Woche. „Bis" darf leer bleiben; ist es gefüllt, darf
       es nicht vor „von" liegen. Statt einer eigenen Prüfroutine bekommt das
       zweite Feld schlicht ein `min` — dann meldet der Browser selbst, und
       die Meldung läuft durch dieselbe Stelle wie alle anderen. */
    (function(){
      const von = form.querySelector('#datum'), bis = form.querySelector('#datum-bis');
      if(!von || !bis) return;
      function grenze(){
        bis.min = von.value || '';
        /* Steht dort schon ein früheres Datum, sofort melden statt bis zum
           Absenden zu warten — man hat gerade beide Felder vor Augen. */
        if(bis.value) pruefen(bis);
      }
      von.addEventListener('change', grenze);
      von.addEventListener('input',  grenze);
      grenze();
    })();

    /* Beim Verlassen prüfen, danach bei jeder Eingabe nachziehen — sonst
       stehen Fehler noch da, während man sie gerade behebt. */
    form.querySelectorAll('input, select, textarea').forEach(feld => {
      if(feld.closest('.honigtopf')) return;
      feld.addEventListener('blur',  ()=> pruefen(feld));
      feld.addEventListener('input', ()=>{
        const huelle = feld.closest('.feld');
        if(huelle && huelle.classList.contains('feld--fehler')) pruefen(feld);
      });
    });

    /* --- Bestätigung --- */
    function danken(){
      const danke = document.createElement('div');
      danke.className = 'danke';
      danke.setAttribute('role', 'status');
      danke.setAttribute('tabindex', '-1');
      danke.innerHTML =
        '<span class="danke__haken" aria-hidden="true">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</span>' +
        '<h2 class="u-caps">' + (form.dataset.dankeTitel || 'Danke!') + '</h2>' +
        '<p>' + (form.dataset.dankeText || 'Ihre Nachricht ist bei uns. Wir melden uns zeitnah zurück.') + '</p>';
      form.replaceWith(danke);
      danke.focus();
      danke.scrollIntoView({ block:'center' });
    }

    /* --- Absenden --- */
    /* Solange eine Übermittlung läuft, nimmt das Formular keine zweite an.
       Sonst erzeugt ein zweiter Klick auf „Senden" — und den macht man,
       wenn nicht sofort etwas passiert — eine doppelte Anfrage in der
       Disposition. */
    let sendetGerade = false;
    function sperren(an){
      sendetGerade = an;
      if(!knopf) return;
      knopf.disabled = an;
      if(an) knopf.setAttribute('aria-busy', 'true');
      else   knopf.removeAttribute('aria-busy');
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if(sendetGerade) return;

      /* Honigtopf gefüllt: eindeutig eine Maschine. Kein Mensch sieht dieses
         Feld. Wir tun so, als sei alles gut — der Bot bekommt keine Auskunft,
         an der er etwas lernen könnte. */
      if(honigtopf && honigtopf.value){ danken(); return; }

      const felder = [...form.querySelectorAll('input, select, textarea')]
        .filter(f => !f.closest('.honigtopf') && !f.disabled);
      let ersterFehler = null;
      felder.forEach(f => { if(!pruefen(f) && !ersterFehler) ersterFehler = f; });
      if(ersterFehler){
        melden('Bitte prüfen Sie die markierten Felder.', 'fehler');
        ersterFehler.focus();
        ersterFehler.scrollIntoView({ block:'center', behavior:'smooth' });
        return;
      }
      /* Auffällig schnell: einmal nachfragen statt wegwerfen. Ein Mensch klickt
         dann einfach noch einmal, ein einfacher Bot verschwindet nach dem
         ersten Versuch. */
      if(!schnellBestaetigt && (Date.now() - geladen) < MINDESTZEIT){
        schnellBestaetigt = true;
        melden('Das ging schnell. Bitte noch einmal auf Senden klicken, dann geht es raus.');
        return;
      }
      melden('');

      const daten = new FormData(form);
      daten.delete(honigtopf ? honigtopf.name : '__kein_feld__');

      /* 0. Die eigene Funktion unter /api/formular. Sie baut aus genau diesen
            Angaben einen PDF-Beleg und schickt ihn ans Büro — das ist der
            Weg, der am Ende zählt.

            Sie antwortet mit 503, solange die Zugangsdaten des Postfachs
            nicht hinterlegt sind, und mit 404, wenn die Seite irgendwo liegt,
            wo es keine Funktionen gibt (GitHub Pages, ein Ordner auf der
            Platte). In beiden Fällen läuft es unten den bisherigen Weg
            weiter — eine Anfrage geht dadurch nie verloren.               */
      if(location.protocol.startsWith('http')){
        sperren(true);
        melden('Wird gesendet …', 'laeuft');
        let stand = 0;
        try{
          const antwort = await fetch('/api/formular', {
            method: 'POST',
            headers: { 'Content-Type':'application/x-www-form-urlencoded',
                       'Accept':'application/json' },
            body: new URLSearchParams(daten).toString()
          });
          stand = antwort.status;
          if(antwort.ok){ danken(); return; }
        }catch(e){ stand = 0; }   /* gar keine Antwort — weiter unten */

        sperren(false);
        melden('');
        /* Nicht vorhanden oder nicht eingerichtet: weiterreichen.
           Alles andere ist ein echter Fehler und wird gemeldet. */
        if(stand && ![404, 405, 501, 503].includes(stand)){
          ersatzweg('Das Absenden hat nicht geklappt.');
          return;
        }
      }

      const endpunkt = form.dataset.endpunkt;
      /* Netlify nimmt den POST nur auf einem Netlify-Deploy entgegen. Überall
         sonst — GitHub Pages, Vercel, lokaler Server — käme ein 404, 405 oder
         501 zurück, und der Absender sähe „Das Absenden hat nicht geklappt“,
         obwohl er alles richtig ausgefüllt hat. Auf diesen Adressen deshalb
         gleich den Mail-Weg nehmen, ohne den Umweg über eine Fehlermeldung. */
      const testhost = /(^|\.)github\.io$|(^|\.)vercel\.app$|(^|\.)pages\.dev$|^localhost$|^127\.|^0\.0\.0\.0$|^192\.168\./
        .test(location.hostname);
      const ueberNetlify = form.dataset.netlify === 'true'
        && location.protocol.startsWith('http') && !testhost;

      if(endpunkt || ueberNetlify){
        sperren(true);
        melden('Wird gesendet …', 'laeuft');
        try{
          const antwort = endpunkt
            ? await fetch(endpunkt, { method:'POST', body:daten, headers:{ Accept:'application/json' } })
            /* An die eigene Adresse statt an "/": Netlify nimmt den Eintrag
               auf jedem Pfad der Site an, und so funktioniert es auch, wenn
               die Seite einmal in einem Unterordner liegt. */
            : await fetch(location.pathname, { method:'POST',
                headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
                body:new URLSearchParams(daten).toString() });
          if(!antwort.ok) throw new Error('HTTP ' + antwort.status);
          danken();
          return;
        }catch(e){
          sperren(false);
          ersatzweg('Das Absenden hat nicht geklappt.');
          return;
        }
      }

      /* Kein Weg hinterlegt — die Seite liegt etwa als Datei auf der Platte. */
      ersatzweg('Diese Vorschau kann noch nicht selbst versenden.');
    });

    /* Wenn online nichts geht.
       ---------------------------------------------------------------------
       Hier stand einmal ein Weg über das Mailprogramm des Besuchers: erst
       öffnete es sich von selbst, später gab es einen Link dorthin. Beides
       ist weg.

       Der Grund ist einfach: Wer ein Formular ausfüllt, will auf „Senden"
       klicken und fertig sein. Alles, was ihn stattdessen in ein anderes
       Programm schickt, liest sich als Fehler — auch wenn es als Hilfe
       gemeint war. Bleibt nur die Meldung, wie man uns sonst erreicht.

       Zu sehen bekommt das ohnehin fast niemand: davor liegen die Funktion
       und, auf Netlify, die Formularannahme. Erst wenn beide ausfallen,
       kommt diese Zeile.                                                   */
    function ersatzweg(vorspann){
      melden(vorspann + ' Bitte rufen Sie uns an unter +49 (40) 27075100 '
           + 'oder schreiben Sie an ' + empfaenger + '.', 'fehler');
    }
  });

  /* ---- Magnetische Knöpfe ----
     Ein Knopf, der der Maus ein Stück entgegenkommt. Das ist die kleinste
     mögliche Rückmeldung: man merkt, dass das Ziel bemerkt hat, dass man
     darauf zusteuert.

     Nur mit einer echten Maus (`hover:hover` und `pointer:fine`) und nur
     ohne reduzierte Bewegung. Auf einem Finger gibt es kein Zusteuern, dort
     wäre die Bewegung nur ein Springen unter dem Daumen.

     Der Weg ist bewusst klein: zehn Pixel waagerecht, sechs senkrecht. Wer
     mehr nimmt, verschiebt die Trefferfläche gegen den sichtbaren Knopf —
     dann klickt man daneben. Die Rückkehr macht eine kurze Überblendung im
     Stylesheet, nicht JavaScript. */
  if(!reduce && window.matchMedia('(hover:hover) and (pointer:fine)').matches){
    document.querySelectorAll('.btn, .form__submit, .film__knopf').forEach(el => {
      el.addEventListener('pointermove', (ev)=>{
        const r = el.getBoundingClientRect();
        const dx = (ev.clientX - (r.left + r.width  / 2)) / Math.max(1, r.width);
        const dy = (ev.clientY - (r.top  + r.height / 2)) / Math.max(1, r.height);
        el.style.setProperty('--mx', (dx * 10).toFixed(1) + 'px');
        el.style.setProperty('--my', (dy * 6).toFixed(1)  + 'px');
      });
      el.addEventListener('pointerleave', ()=>{
        el.style.setProperty('--mx', '0px');
        el.style.setProperty('--my', '0px');
      });
    });
  }

  /* ---- Zeiger ----
     Ein weicher Ring, der der Maus nachläuft: über Links wird er größer,
     über den sechs Szenen zeigt er „Ansehen". Nur am Schreibtisch — auf
     einem Touchgerät gibt es keinen Zeiger, dem etwas nachlaufen könnte.

     Der Systemzeiger bleibt sichtbar. Viele Auftritte dieser Machart blenden
     ihn aus und ersetzen ihn durch den eigenen Punkt; das sieht einen Moment
     lang beeindruckend aus und nimmt allen die Einstellung weg, die ihren
     Zeiger vergrößert, invertiert oder auf hohen Kontrast gestellt haben.
     Auf einer Seite, deren Ziel eine Anfrage ist, ist das ein schlechtes
     Geschäft. Der Ring begleitet also, er ersetzt nicht.

     Kosten: ein pointermove-Listener und eine rAF-Schleife, die von selbst
     endet, sobald der Ring seinen Zielpunkt erreicht hat. Es läuft nichts
     im Leerlauf weiter. */
  (function(){
    if(reduce) return;
    if(!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;

    const ring = document.createElement('div');
    ring.className = 'zeiger';
    ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<span class="zeiger__wort">Ansehen</span>';
    document.body.appendChild(ring);

    let zielX = window.innerWidth / 2, zielY = window.innerHeight / 2;
    let x = zielX, y = zielY, laeuft = false, sichtbar = false;

    function folgen(){
      /* Nachlauf statt harter Kopplung: der Ring hängt eine Spur hinterher,
         und genau dieser Verzug macht ihn ruhig statt nervös. */
      x += (zielX - x) * .18;
      y += (zielY - y) * .18;
      ring.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%)';
      if(Math.abs(zielX - x) > .3 || Math.abs(zielY - y) > .3){
        requestAnimationFrame(folgen);
      } else {
        laeuft = false;
      }
    }

    window.addEventListener('pointermove', (ev)=>{
      if(ev.pointerType && ev.pointerType !== 'mouse') return;
      zielX = ev.clientX; zielY = ev.clientY;
      if(!sichtbar){ sichtbar = true; ring.classList.add('an'); }
      if(!laeuft){ laeuft = true; requestAnimationFrame(folgen); }
    }, { passive:true });

    /* Zustand am Zielobjekt ablesen, nicht an jedem Element einzeln
       anmelden: ein Listener für die ganze Seite statt hunderter. */
    document.addEventListener('pointerover', (ev)=>{
      const el = ev.target.closest ? ev.target : ev.target.parentElement;
      if(!el || !el.closest) return;
      ring.classList.toggle('zeiger--sehen', !!el.closest('.gal__item, .film__buehne'));
      ring.classList.toggle('zeiger--aktiv',
        !!el.closest('a, button, [role="button"], input, select, textarea, summary, label'));
    }, true);

    /* Verlässt die Maus das Fenster, verschwindet der Ring — sonst bleibt er
       am Rand kleben, während der Zeiger längst woanders ist. */
    const weg = ()=>{ sichtbar = false; ring.classList.remove('an'); };
    document.documentElement.addEventListener('mouseleave', weg);
    window.addEventListener('blur', weg);
  })();

  /* rAF-throttled scroll */
  let ticking = false;
  function onScroll(){
    onScrollTop();
    leisteScrollt();
    clearTimeout(nachleseZeit);
    nachleseZeit = setTimeout(nachlese, 160);
    if(!reduce && !ticking){
      ticking = true;
      requestAnimationFrame(()=>{
        messen();
        updateStages(); updateMotion(); updateKino(); scrubVideos();
        ticking = false;
      });
    }
  }
  function alles(){ navHoehe(); messen(); updateStages(); updateMotion(); updateKino(); }
  window.addEventListener('scroll', onScroll, { passive:true });

  /* ---- Der Bestandskundenbereich ----
     Auf `kontakt.html` steht über dem gewöhnlichen Anfrageformular eine
     Zeile für Bestandskunden. Von dort geht es: anmelden → Bedarf →
     Übersicht → gesendet.

     Fünf Entscheidungen, die man kennen muss:

     1. **Der Bereich fragt zuerst, ob es ihn gibt.** Ohne Datenbank
        antwortet `/api/konto` mit 503, und dann bleibt der ganze Abschnitt
        auf `hidden`. Es gibt also nie einen Knopf, hinter dem nichts ist —
        und ohne JavaScript ebenso wenig, denn gebaut wird hier gar nichts.
     2. **Nichts wird im Browser gespeichert.** Wer angemeldet ist, sagt
        allein der Keks, den der Server gesetzt hat und den kein Skript
        lesen kann (HttpOnly). Im `localStorage` steht kein Wort — eine
        Anmeldung, die dort läge, wäre mit einem einzigen XSS zu holen.
     3. **Der Text kommt aus dem Markup.** Hier stehen nur Zustände und
        Zahlen. Was ein Mensch liest, steht in `kontakt.html` — sonst käme
        es weder durch das Korrekturlesen noch durch die Werkzeuge.
     4. **Die Personalarten kommen vom Server** (`api/_personal.js`). Wer
        eine Art umbenennt, ändert eine Datei; hier ist nichts nachzuziehen.
     5. **Jeder Absendeversuch trägt denselben Schlüssel.** Zweimal auf
        „Senden" ergibt deshalb eine Anfrage, nicht zwei — auch dann, wenn
        die erste Antwort unterwegs verloren geht.                        */
  (function(){
    const tuer = document.getElementById('bestandskunde');
    if(!tuer) return;

    const bereich  = document.getElementById('kundenbereich');
    const knopf    = tuer.querySelector('.kundentuer__knopf');
    const schritte = [...bereich.querySelectorAll('.kb-schritt')];
    const zeigen   = name => schritte.forEach(s => { s.hidden = s.dataset.schritt !== name; });
    const teil     = name => bereich.querySelector(`[data-schritt="${name}"]`);

    /* Standardzeiten eines Einsatzes. Ein Startwert, kein Versprechen — er
       steht in zwei Feldern, die man überschreibt. Abende sind der
       häufigste Fall; wer tagsüber aufbaut, ändert zwei Zahlen. */
    const VON = '18:00', BIS = '23:00';

    let arten = [];        /* vom Server */
    let kunde = null;      /* nach der Anmeldung */
    let tage  = [];        /* der Bedarf */
    let entwurf = null;    /* was in der Übersicht steht */
    let schluessel = '';   /* gegen Doppelabsenden */

    /* ---- Verbindung ---- */

    async function ruf(aktion, daten){
      let a;
      try {
        a = await fetch('/api/konto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
                     'X-HST-Bereich': 'kundenbereich' },
          credentials: 'same-origin',
          body: JSON.stringify({ aktion, ...(daten || {}) })
        });
      } catch(e){
        /* Kein Netz, Flugmodus, Funkloch. Der Unterschied zu einem
           Serverfehler ist für den Benutzer wesentlich: das eine kann er
           selbst beheben. */
        return { code: 0, rumpf: { ok: false, offline: true,
          grund: 'Keine Verbindung. Bitte prüfen Sie Ihr Netz und versuchen Sie es noch einmal.' } };
      }
      let rumpf = {};
      try { rumpf = await a.json(); } catch(e){}
      return { code: a.status, rumpf };
    }

    function melde(wo, text, stand){
      const p = wo.querySelector('.form__status');
      if(!p) return;
      p.textContent = text || '';
      if(stand) p.setAttribute('data-stand', stand); else p.removeAttribute('data-stand');
    }

    function feldFehler(feld, text){
      const kasten = feld.closest('.feld');
      if(!kasten) return;
      kasten.classList.toggle('feld--fehler', !!text);
      const p = kasten.querySelector('.feld__fehler');
      if(p) p.textContent = text || '';
    }

    /* Eine abgelaufene Sitzung führt zurück zur Anmeldung — und nicht in
       eine Seite, auf der nichts mehr geht. */
    function abgelaufen(){
      kunde = null;
      zeigen('anmelden');
      melde(teil('anmelden'), 'Ihre Anmeldung ist abgelaufen. Bitte melden Sie sich neu an.', 'fehler');
      bereich.scrollIntoView({ block:'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }

    /* ---- Die Tür ---- */

    function tuerAuf(auf){
      knopf.setAttribute('aria-expanded', String(auf));
      if(auf){
        bereich.hidden = false;
        requestAnimationFrame(()=> bereich.classList.add('auf'));
        const erstes = bereich.querySelector('.kb-schritt:not([hidden]) input:not([type=checkbox]), .kb-schritt:not([hidden]) button');
        if(erstes && !reduce) setTimeout(()=> erstes.focus({ preventScroll:true }), 60);
      } else {
        bereich.classList.remove('auf');
        setTimeout(()=>{ if(knopf.getAttribute('aria-expanded') !== 'true') bereich.hidden = true; }, 420);
      }
    }

    knopf.addEventListener('click', ()=> tuerAuf(knopf.getAttribute('aria-expanded') !== 'true'));

    /* ---- Anmelden ---- */

    const anmeldeteil = teil('anmelden');
    const anmeldung   = anmeldeteil.querySelector('.kb-anmeldung');
    const vergessen   = anmeldeteil.querySelector('.kb-vergessen');

    anmeldung.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const name = anmeldung.anmeldename, pass = anmeldung.passwort;
      feldFehler(name, ''); feldFehler(pass, '');
      if(!name.value.trim()){ feldFehler(name, 'Bitte tragen Sie Ihren Anmeldenamen ein.'); name.focus(); return; }
      if(!pass.value){ feldFehler(pass, 'Bitte tragen Sie Ihr Passwort ein.'); pass.focus(); return; }

      const senden = anmeldung.querySelector('button[type=submit]');
      senden.setAttribute('aria-busy', 'true');
      melde(anmeldung, 'Wird geprüft …', 'laeuft');

      const a = await ruf('anmelden', {
        anmeldename: name.value.trim(),
        passwort: pass.value,
        bleiben: anmeldung.bleiben.checked
      });
      senden.removeAttribute('aria-busy');

      if(!a.rumpf.ok){
        melde(anmeldung, a.rumpf.grund || 'Anmeldung nicht möglich.', 'fehler');
        pass.value = '';
        pass.focus();
        return;
      }
      melde(anmeldung, '', null);
      pass.value = '';
      angemeldet(a.rumpf.kunde, true, true);
    });

    anmeldeteil.querySelector('[data-vergessen]').addEventListener('click', ()=>{
      anmeldung.hidden = true; vergessen.hidden = false;
      vergessen.email.focus();
    });
    vergessen.querySelector('[data-zurueck]').addEventListener('click', ()=>{
      vergessen.hidden = true; anmeldung.hidden = false;
      melde(vergessen, '', null);
    });

    vergessen.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const feld = vergessen.email;
      feldFehler(feld, '');
      if(!feld.value.includes('@')){ feldFehler(feld, 'Bitte tragen Sie Ihre E-Mail-Adresse ein.'); return; }
      const senden = vergessen.querySelector('button[type=submit]');
      senden.setAttribute('aria-busy', 'true');
      const a = await ruf('passwort-vergessen', { email: feld.value.trim() });
      senden.removeAttribute('aria-busy');
      melde(vergessen, a.rumpf.hinweis || a.rumpf.grund || '', a.rumpf.ok ? null : 'fehler');
    });

    /* ---- Neues Passwort aus einem Link ----
       Der Link aus der Mail trägt die Marke hinter dem Doppelkreuz. Dort
       steht sie richtig: was hinter `#` steht, schickt der Browser nicht an
       den Server und es landet in keinem Zugriffsprotokoll. */
    const neuform = teil('passwort-neu').querySelector('.kb-neu');
    let resetMarke = '';
    (function ausDerAdresse(){
      const m = /(?:^|#|&)passwort-neu=([A-Za-z0-9_-]{20,})/.exec(location.hash || '');
      if(!m) return;
      resetMarke = m[1];
      /* Aus der Adresse nehmen, damit sie nicht im Verlauf stehen bleibt. */
      history.replaceState(null, '', location.pathname + location.search);
      tuer.hidden = false;
      tuerAuf(true);
      zeigen('passwort-neu');
      setTimeout(()=> neuform.passwort.focus({ preventScroll:true }), 80);
      tuer.scrollIntoView({ block:'start', behavior:'auto' });
    })();

    neuform.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const feld = neuform.passwort;
      feldFehler(feld, '');
      if(feld.value.length < 10){ feldFehler(feld, 'Bitte mindestens zehn Zeichen wählen.'); return; }
      const senden = neuform.querySelector('button[type=submit]');
      senden.setAttribute('aria-busy', 'true');
      const a = await ruf('passwort-neu', { marke: resetMarke, passwort: feld.value });
      senden.removeAttribute('aria-busy');
      if(!a.rumpf.ok){ melde(neuform, a.rumpf.grund || 'Das hat nicht geklappt.', 'fehler'); return; }
      feld.value = '';
      zeigen('anmelden');
      melde(anmeldung, a.rumpf.hinweis || 'Das Passwort wurde geändert.', null);
      anmeldung.anmeldename.focus();
    });

    /* ---- Passkeys ----
       Auf Face ID greift hier nichts zu. WebAuthn fragt das Gerät, und das
       Gerät entscheidet selbst, wie es seinen Besitzer erkennt — auf einem
       iPhone ist das Face ID, auf einem Windows-Rechner Hello oder die PIN.
       Angeboten wird es nur, wenn der Browser es kann; sonst wird der Knopf
       entfernt statt abgeblendet. */
    const kannPasskey = typeof window.PublicKeyCredential !== 'undefined'
                     && !!(navigator.credentials && navigator.credentials.create);

    const b64 = {
      ein(s){
        const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
        const b = atob(t + '='.repeat((4 - t.length % 4) % 4));
        const u = new Uint8Array(b.length);
        for(let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        return u.buffer;
      },
      aus(b){
        const u = new Uint8Array(b); let s = '';
        for(let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }
    };

    /* Wie das Gerät heißt, in einem Satz. Nur zur Wiedererkennung in der
       Liste — es wird nichts ausgewertet und nichts weitergegeben. */
    function geraetName(){
      const u = navigator.userAgent || '';
      if(/iPhone/.test(u)) return 'iPhone';
      if(/iPad/.test(u)) return 'iPad';
      if(/Android/.test(u)) return 'Android-Gerät';
      if(/Macintosh/.test(u)) return 'Mac';
      if(/Windows/.test(u)) return 'Windows-Gerät';
      return 'Dieses Gerät';
    }

    const passkeyKnopf = anmeldung.querySelector('.kb-passkey');
    if(!kannPasskey) passkeyKnopf.remove();

    passkeyKnopf && passkeyKnopf.addEventListener('click', async ()=>{
      passkeyKnopf.setAttribute('aria-busy', 'true');
      melde(anmeldung, '', null);
      try {
        const s = await ruf('passkey-anmelden-start', {
          anmeldename: anmeldung.anmeldename.value.trim() || undefined });
        if(!s.rumpf.ok) throw new Error(s.rumpf.grund || 'Passkeys stehen nicht zur Verfügung.');

        const o = s.rumpf.optionen;
        const zeugnis = await navigator.credentials.get({ publicKey: {
          ...o,
          challenge: b64.ein(o.challenge),
          allowCredentials: (o.allowCredentials || []).map(c => ({ ...c, id: b64.ein(c.id) }))
        }});

        const a = await ruf('passkey-anmelden-ende', {
          marke: s.rumpf.marke,
          bleiben: anmeldung.bleiben.checked,
          antwort: {
            id: zeugnis.id, rawId: b64.aus(zeugnis.rawId), type: zeugnis.type,
            clientExtensionResults: zeugnis.getClientExtensionResults(),
            response: {
              clientDataJSON:    b64.aus(zeugnis.response.clientDataJSON),
              authenticatorData: b64.aus(zeugnis.response.authenticatorData),
              signature:         b64.aus(zeugnis.response.signature),
              userHandle: zeugnis.response.userHandle ? b64.aus(zeugnis.response.userHandle) : null
            }
          }
        });
        if(!a.rumpf.ok) throw new Error(a.rumpf.grund || 'Anmeldung nicht möglich.');
        angemeldet(a.rumpf.kunde, false, true);
      } catch(e){
        /* Abgebrochen ist kein Fehler — wer Face ID wegwischt, will das
           Passwort. Alles andere bekommt eine Meldung. */
        const abgebrochen = e && (e.name === 'NotAllowedError' || e.name === 'AbortError');
        melde(anmeldung, abgebrochen ? '' : (e.message || 'Die Anmeldung mit Passkey hat nicht geklappt.'),
              abgebrochen ? null : 'fehler');
        if(abgebrochen) anmeldung.anmeldename.focus();
      } finally {
        passkeyKnopf.removeAttribute('aria-busy');
      }
    });

    const anbieten = teil('anfrage').querySelector('[data-passkey-anbieten]');
    anbieten.addEventListener('click', async ()=>{
      anbieten.setAttribute('aria-busy', 'true');
      try {
        const s = await ruf('passkey-einrichten-start');
        if(!s.rumpf.ok) throw new Error(s.rumpf.grund || 'Das geht hier nicht.');
        const o = s.rumpf.optionen;
        const neu = await navigator.credentials.create({ publicKey: {
          ...o,
          challenge: b64.ein(o.challenge),
          user: { ...o.user, id: b64.ein(o.user.id) },
          excludeCredentials: (o.excludeCredentials || []).map(c => ({ ...c, id: b64.ein(c.id) }))
        }});
        const a = await ruf('passkey-einrichten-ende', {
          marke: s.rumpf.marke, geraet: geraetName(),
          antwort: {
            id: neu.id, rawId: b64.aus(neu.rawId), type: neu.type,
            clientExtensionResults: neu.getClientExtensionResults(),
            response: {
              clientDataJSON:    b64.aus(neu.response.clientDataJSON),
              attestationObject: b64.aus(neu.response.attestationObject),
              transports: neu.response.getTransports ? neu.response.getTransports() : []
            }
          }
        });
        if(!a.rumpf.ok) throw new Error(a.rumpf.grund || 'Der Passkey konnte nicht gespeichert werden.');
        kunde = a.rumpf.kunde;
        anbieten.hidden = true;
        melde(teil('anfrage').querySelector('.kb-formular'),
              'Beim nächsten Mal genügt Face ID oder Ihr Gerätecode.', null);
      } catch(e){
        const abgebrochen = e && (e.name === 'NotAllowedError' || e.name === 'AbortError');
        if(!abgebrochen) melde(teil('anfrage').querySelector('.kb-formular'),
          e.message || 'Das hat nicht geklappt.', 'fehler');
      } finally {
        anbieten.removeAttribute('aria-busy');
      }
    });

    /* ---- Angemeldet ---- */

    const anfrageteil = teil('anfrage');
    const formular    = anfrageteil.querySelector('.kb-formular');

    function angemeldet(daten, mitPasswort, oeffnen){
      kunde = daten;
      const person = (kunde.ansprechpartner || []).find(p => p.haupt) || (kunde.ansprechpartner || [])[0];
      anfrageteil.querySelector('[data-firma]').textContent = kunde.firma || '';
      anfrageteil.querySelector('[data-person]').textContent =
        person ? [person.vorname, person.nachname].filter(Boolean).join(' ') : '';
      anfrageteil.querySelector('[data-kundennummer]').textContent =
        'Kundennummer ' + (kunde.kundennummer || '');

      /* Der Passkey wird erst angeboten, wenn jemand sein Passwort eingegeben
         hat: nach einer Anmeldung MIT Passkey wäre die Frage sinnlos, und
         ohne Passwort davor wäre sie eine Einladung an jeden, der gerade am
         offenen Rechner sitzt. */
      anbieten.hidden = !(mitPasswort && kannPasskey && kunde.passkeyMoeglich
                          && (kunde.passkeys || []).length === 0);

      tageZuruecksetzen();
      zeigen('anfrage');
      /* Beim Anmelden aufmachen und hinspringen. Beim stillen Wiederfinden
         einer laufenden Sitzung nicht: dort soll die Seite ruhig stehen
         bleiben, bis jemand die Tuer selbst oeffnet. */
      if(oeffnen !== false){
        tuerAuf(true);
        anfrageteil.scrollIntoView({ block:'start', behavior: reduce ? 'auto' : 'smooth' });
      }
    }

    anfrageteil.querySelector('[data-abmelden]').addEventListener('click', async ()=>{
      await ruf('abmelden');
      kunde = null;
      anmeldung.hidden = false; vergessen.hidden = true;
      melde(anmeldung, '', null);
      zeigen('anmelden');
    });

    /* ---- Der Bedarf: Tage und Mengen ---- */

    const tageKasten = anfrageteil.querySelector('[data-tage]');

    function heutePlus(n){
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    }
    function tagDanach(datum){
      if(!datum) return '';
      const d = new Date(datum + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    function datumHuebsch(w){
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w || '');
      if(!m) return '';
      const TAGE = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
      const d = new Date(w + 'T12:00:00');
      return `${TAGE[d.getDay()]}, ${m[3]}.${m[2]}.${m[1]}`;
    }

    function leererTag(vorbild){
      const mengen = {};
      arten.forEach(a => { mengen[a.schluessel] = vorbild ? vorbild.mengen[a.schluessel] : 0; });
      return {
        datum: vorbild ? tagDanach(vorbild.datum) : '',
        von: vorbild ? vorbild.von : VON,
        bis: vorbild ? vorbild.bis : BIS,
        mengen
      };
    }

    function tageZuruecksetzen(){
      tage = [leererTag(null)];
      schluessel = '';
      tageMalen();
      formular.reset();
      melde(formular, '', null);
    }

    function tageMalen(){
      tageKasten.textContent = '';
      tage.forEach((tag, i) => tageKasten.appendChild(tagBauen(tag, i)));
      anfrageteil.querySelector('[data-tag-plus]').hidden = tage.length >= 14;
    }

    function tagBauen(tag, i){
      const wurzel = document.createElement('div');
      wurzel.className = 'kb-tag';

      const kopf = document.createElement('div');
      kopf.className = 'kb-tag__kopf';

      if(tage.length > 1){
        const marke = document.createElement('span');
        marke.className = 'kb-tag__marke';
        marke.textContent = 'Tag ' + (i + 1);
        kopf.appendChild(marke);
      }

      kopf.appendChild(tagFeld('Datum', 'date', tag.datum, w => { tag.datum = w; }, 'kb-datum-' + i, heutePlus(0), 'datum'));
      kopf.appendChild(tagFeld('Von',  'time', tag.von,   w => { tag.von = w; },   'kb-von-' + i, null, 'zeit'));
      kopf.appendChild(tagFeld('Bis',  'time', tag.bis,   w => { tag.bis = w; },   'kb-bis-' + i, null, 'zeit'));

      if(tage.length > 1){
        const weg = document.createElement('button');
        weg.type = 'button';
        weg.className = 'kb-textknopf kb-tag__weg';
        weg.textContent = 'Tag entfernen';
        weg.addEventListener('click', ()=>{ tage.splice(i, 1); tageMalen(); });
        kopf.appendChild(weg);
      }
      wurzel.appendChild(kopf);

      const liste = document.createElement('div');
      liste.className = 'kb-arten';
      arten.forEach(art => liste.appendChild(artZeile(art, tag)));
      wurzel.appendChild(liste);
      return wurzel;
    }

    function tagFeld(beschriftung, typ, wert, setzen, id, min, art){
      const kasten = document.createElement('div');
      kasten.className = 'kb-tag__feld' + (art ? ' kb-tag__feld--' + art : '');
      const label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = beschriftung;
      const feld = document.createElement('input');
      feld.type = typ; feld.id = id; feld.value = wert || '';
      if(min) feld.min = min;
      feld.addEventListener('input', ()=> setzen(feld.value));
      kasten.appendChild(label); kasten.appendChild(feld);
      return kasten;
    }

    function artZeile(art, tag){
      const zeile = document.createElement('div');
      zeile.className = 'kb-art';

      const wort = document.createElement('div');
      wort.className = 'kb-art__wort';
      const name = document.createElement('span');
      name.className = 'kb-art__name';
      name.textContent = art.name;
      const hinweis = document.createElement('span');
      hinweis.className = 'kb-art__hinweis';
      hinweis.textContent = art.hinweis || '';
      wort.appendChild(name); wort.appendChild(hinweis);

      const menge = document.createElement('div');
      menge.className = 'kb-menge';
      const zahl = document.createElement('span');
      zahl.className = 'kb-menge__zahl';

      const weniger = mengenKnopf('−', 'Eine Person weniger ' + art.name);
      const mehr    = mengenKnopf('+', 'Eine Person mehr ' + art.name);

      function schreiben(stups){
        const n = tag.mengen[art.schluessel] || 0;
        zahl.textContent = String(n);
        zeile.classList.toggle('kb-art--an', n > 0);
        weniger.disabled = n <= 0;
        mehr.disabled = n >= 999;
        if(stups && !reduce){
          zahl.classList.add('stups');
          setTimeout(()=> zahl.classList.remove('stups'), 200);
        }
      }
      function aendern(um){
        const n = Math.min(999, Math.max(0, (tag.mengen[art.schluessel] || 0) + um));
        tag.mengen[art.schluessel] = n;
        schreiben(true);
      }
      weniger.addEventListener('click', ()=> aendern(-1));
      mehr.addEventListener('click', ()=> aendern(+1));

      menge.appendChild(weniger); menge.appendChild(zahl); menge.appendChild(mehr);
      zeile.appendChild(wort); zeile.appendChild(menge);
      schreiben(false);
      return zeile;
    }

    function mengenKnopf(zeichen, name){
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = zeichen;
      b.setAttribute('aria-label', name);
      return b;
    }

    anfrageteil.querySelector('[data-tag-plus]').addEventListener('click', ()=>{
      tage.push(leererTag(tage[tage.length - 1]));
      tageMalen();
      const letzte = tageKasten.lastElementChild;
      if(letzte) letzte.scrollIntoView({ block:'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });

    /* ---- Prüfen ---- */

    function positionenBauen(){
      const raus = [];
      tage.forEach(tag => {
        arten.forEach(art => {
          const n = tag.mengen[art.schluessel] || 0;
          if(n > 0) raus.push({
            art: art.schluessel, artName: art.name, anzahl: n,
            datum: tag.datum, von: tag.von, bis: tag.bis,
            ueberNacht: tag.bis <= tag.von
          });
        });
      });
      return raus;
    }

    formular.addEventListener('submit', (ev)=>{
      ev.preventDefault();
      melde(formular, '', null);
      ['projekt','einsatzort'].forEach(n => feldFehler(formular[n], ''));

      if(!formular.projekt.value.trim()){
        feldFehler(formular.projekt, 'Bitte geben Sie an, worum es geht.');
        formular.projekt.focus(); return;
      }
      if(!formular.einsatzort.value.trim()){
        feldFehler(formular.einsatzort, 'Bitte geben Sie den Einsatzort an.');
        formular.einsatzort.focus(); return;
      }
      const ohneDatum = tage.findIndex(t => !t.datum);
      if(ohneDatum >= 0){
        melde(formular, `Bitte tragen Sie beim ${tage.length > 1 ? (ohneDatum + 1) + '. Tag' : 'Einsatz'} ein Datum ein.`, 'fehler');
        const feld = tageKasten.querySelector(`#kb-datum-${ohneDatum}`);
        if(feld) feld.focus();
        return;
      }
      const positionen = positionenBauen();
      if(!positionen.length){
        melde(formular, 'Bitte wählen Sie mindestens eine Personalart aus.', 'fehler');
        tageKasten.scrollIntoView({ block:'nearest', behavior: reduce ? 'auto' : 'smooth' });
        return;
      }

      entwurf = {
        projekt:    formular.projekt.value.trim(),
        einsatzort: formular.einsatzort.value.trim(),
        adresse:    formular.adresse.value.trim(),
        hinweise:   formular.hinweise.value.trim(),
        positionen
      };
      /* Ein Schlüssel je Entwurf, nicht je Klick: zweimal auf „Senden"
         ergibt dieselbe Anfrage. Neu wird er erst bei der nächsten
         Anfrage. */
      if(!schluessel) schluessel = 'a-' + Date.now().toString(36) + '-'
        + Math.floor(Math.random() * 1e9).toString(36);

      uebersichtMalen(teil('pruefen').querySelector('[data-uebersicht]'), entwurf);
      zeigen('pruefen');
      teil('pruefen').scrollIntoView({ block:'start', behavior: reduce ? 'auto' : 'smooth' });
    });

    function uebersichtMalen(wo, d){
      wo.textContent = '';

      const zeile = (was, wert) => {
        if(!wert) return;
        const z = document.createElement('div'); z.className = 'kb-ueber__zeile';
        const a = document.createElement('span'); a.className = 'kb-ueber__was'; a.textContent = was;
        const b = document.createElement('span'); b.className = 'kb-ueber__wert'; b.textContent = wert;
        z.appendChild(a); z.appendChild(b); wo.appendChild(z);
      };
      zeile('Firma', kunde ? kunde.firma : '');
      zeile('Projekt', d.projekt);
      zeile('Einsatzort', d.einsatzort);
      zeile('Adresse', d.adresse);

      /* Nach Tagen gruppiert — so liest es die Disposition, und so steht es
         auch in der Mail. */
      const proTag = new Map();
      d.positionen.forEach(p => {
        if(!proTag.has(p.datum)) proTag.set(p.datum, []);
        proTag.get(p.datum).push(p);
      });
      [...proTag.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).forEach(([datum, liste]) => {
        const kasten = document.createElement('div'); kasten.className = 'kb-ueber__tag';
        const marke = document.createElement('span'); marke.className = 'kb-ueber__tagmarke';
        marke.textContent = datumHuebsch(datum);
        kasten.appendChild(marke);
        liste.forEach(p => {
          const z = document.createElement('div'); z.className = 'kb-ueber__posten';
          const n = document.createElement('span'); n.className = 'kb-ueber__anzahl';
          n.textContent = p.anzahl + ' ×';
          const a = document.createElement('span'); a.className = 'kb-ueber__art';
          a.textContent = p.artName;
          const t = document.createElement('span'); t.className = 'kb-ueber__zeit';
          t.textContent = `${p.von}–${p.bis} Uhr` + (p.ueberNacht ? ' (über Nacht)' : '');
          z.appendChild(n); z.appendChild(a); z.appendChild(t);
          kasten.appendChild(z);
        });
        wo.appendChild(kasten);
      });

      if(d.hinweise){
        const kasten = document.createElement('div'); kasten.className = 'kb-ueber__tag';
        const marke = document.createElement('span'); marke.className = 'kb-ueber__tagmarke';
        marke.textContent = 'Hinweise zum Einsatz';
        const p = document.createElement('p'); p.className = 'kb-ueber__wert';
        p.textContent = d.hinweise;
        kasten.appendChild(marke); kasten.appendChild(p);
        wo.appendChild(kasten);
      }
    }

    teil('pruefen').querySelector('[data-zurueck-bearbeiten]').addEventListener('click', ()=>{
      zeigen('anfrage');
      anfrageteil.scrollIntoView({ block:'start', behavior: reduce ? 'auto' : 'smooth' });
    });

    /* ---- Senden ---- */

    const sendeKnopf = teil('pruefen').querySelector('[data-senden]');
    let laeuft = false;

    sendeKnopf.addEventListener('click', async ()=>{
      if(laeuft) return;                 /* zweimal tippen ändert nichts */
      laeuft = true;
      sendeKnopf.setAttribute('aria-busy', 'true');
      melde(teil('pruefen'), 'Wird gesendet …', 'laeuft');

      const a = await ruf('anfrage', {
        ...entwurf,
        positionen: entwurf.positionen.map(p => ({
          art: p.art, anzahl: p.anzahl, datum: p.datum,
          von: p.von, bis: p.bis, ueberNacht: p.ueberNacht
        })),
        vorgangsschluessel: schluessel
      });

      laeuft = false;
      sendeKnopf.removeAttribute('aria-busy');

      if(a.code === 401 && a.rumpf.abgelaufen){
        /* Die Anfrage ist nicht verloren: der Entwurf steht noch, und nach
           der Anmeldung geht es an derselben Stelle weiter. */
        abgelaufen();
        return;
      }
      if(!a.rumpf.ok){
        melde(teil('pruefen'), a.rumpf.grund || 'Die Anfrage konnte nicht gespeichert werden.', 'fehler');
        return;
      }

      melde(teil('pruefen'), '', null);
      const fertig = teil('fertig');
      fertig.querySelector('[data-nummer]').textContent = a.rumpf.anfragenummer || '';
      fertig.querySelector('[data-fertig-satz]').textContent = a.rumpf.benachrichtigt
        ? 'Ihre Anfrage liegt unserem Dispositionsteam vor. Sie erhalten gleich eine Bestätigung per E-Mail.'
        : 'Ihre Anfrage ist gespeichert. Die Bestätigung per E-Mail konnte gerade nicht zugestellt werden: melden Sie sich im Zweifel unter +49 (40) 27075100 mit Ihrer Anfragenummer.';
      uebersichtMalen(fertig.querySelector('[data-uebersicht-fertig]'), entwurf);
      zeigen('fertig');
      fertig.scrollIntoView({ block:'start', behavior: reduce ? 'auto' : 'smooth' });
    });

    teil('fertig').querySelector('[data-neue-anfrage]').addEventListener('click', ()=>{
      entwurf = null;
      tageZuruecksetzen();
      zeigen('anfrage');
      anfrageteil.scrollIntoView({ block:'start', behavior: reduce ? 'auto' : 'smooth' });
    });

    /* ---- Los: erst fragen, ob es den Bereich gibt ---- */

    (async function anfangen(){
      const a = await ruf('stand');
      if(a.code === 503 || !a.rumpf || a.rumpf.bereit !== true) return;   /* Tür bleibt zu */
      arten = a.rumpf.personal || [];
      if(!arten.length) return;
      tuer.hidden = false;
      if(passkeyKnopf && a.rumpf.passkeyMoeglich) passkeyKnopf.hidden = false;
      /* Wer schon angemeldet ist (langlebige Sitzung), landet gleich in der
         Anfrage — ohne zweite Anmeldung und ohne dass etwas aufblitzt. */
      if(a.rumpf.angemeldet && a.rumpf.kunde){
        angemeldet(a.rumpf.kunde, false, true);
        tuerAuf(false);
        knopf.setAttribute('aria-expanded', 'false');
      }
    })();
  })();

  /* navHoehe() hing bis hierher an `alles()`, und das lief nur `if(!reduce)`.
     Bei reduzierter Bewegung stand `--nav-h` deshalb nie — überall galt der
     Rückfallwert 78 px, während die Kopfzeile bei 1440 px 98 px hoch ist.
     Die Höhe ist aber keine Frage der Bewegung, sondern eine Tatsache über
     das Layout. Sie wird jetzt in jeder Lage geschrieben. */
  window.addEventListener('resize', ()=>{ navHoehe(); onScrollTop(); if(!reduce) alles(); });
  navHoehe(); onScrollTop(); if(!reduce) alles();
})();
