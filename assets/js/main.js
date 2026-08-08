/* ============================================================
   HST Relaunch — interactions
   ============================================================ */
(function(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Preloader: Linie zieht auf, Logo baut sich auf, dann sofort die Seite.
     Nur beim ersten Öffnen — wer im selben Besuch zurück auf die Startseite
     kommt, soll nicht jedes Mal warten. */
  (function(){
    const pre = document.getElementById('preloader');
    if(!pre) return;
    let gesehen = false;
    try { gesehen = sessionStorage.getItem('hst-intro') === '1'; } catch(e){}
    if(gesehen || reduce){ pre.classList.add('instant','done'); return; }
    try { sessionStorage.setItem('hst-intro','1'); } catch(e){}
    const fertig = ()=> pre.classList.add('done');
    setTimeout(fertig, 1180);          // Ende der Aufbau-Animation
    setTimeout(fertig, 2400);          // Notausstieg, falls etwas hängt
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
    nav.classList.toggle('scrolled', y > 40);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h>0 ? (y/h*100) : 0) + '%';
    toTop.classList.toggle('show', y > window.innerHeight * 0.9);
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
  document.querySelectorAll('#mobileMenu a').forEach(a=> a.addEventListener('click', ()=>{
    /* Beim Wechsel auf eine andere Seite den Fokus nicht zurückholen — das
       Dokument wird ohnehin ersetzt. */
    document.body.classList.remove('menu-open','locked');
    burger.setAttribute('aria-expanded', false);
    dahinter.forEach(el => { if(el) el.removeAttribute('inert'); });
  }));
  document.addEventListener('keydown', (ev)=>{
    if(ev.key === 'Escape' && document.body.classList.contains('menu-open')) menueSetzen(false);
  });

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
  document.querySelectorAll('.reveal-up, [data-stagger]').forEach(el=>{
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

  /* ---- Cinematic scroll-zoom for each stage ---- */
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
    oben:   undefined, unten: undefined,
  }));

  /* Nur schreiben, wenn sich der Wert wirklich geändert hat — jedes
     setProperty stößt sonst unnötig Style- und Compositing-Arbeit an. */
  function set(st, el, key, value){
    if(!el || st.last[key] === value) return;
    st.last[key] = value;
    el.style.setProperty('--' + key, value);
  }

  function updateStages(){
    const vh = window.innerHeight;
    for(const st of stages){
      const rect = st.el.getBoundingClientRect();
      /* Fuer Kinobalken und Kapitelrail merken statt gleich noch einmal zu
         messen — jedes getBoundingClientRect kostet, und pro Bild wuerden
         sonst acht weitere anfallen. */
      st.oben = rect.top; st.unten = rect.bottom;
      const total = st.el.offsetHeight - vh;
      const p = clamp((-rect.top) / total, 0, 1);
      // zoom in as we scroll through
      set(st, st.scene,  'zoom',   (1 + p*1.7).toFixed(3));
      // detail (interior/closeup) cross-fades in
      set(st, st.detail, 'detail', smooth(0.34, 0.62, p).toFixed(3));
      // panel reveals last
      set(st, st.panel,  'panel',  smooth(0.5, 0.82, p).toFixed(3));
      // Tür/Tor zuerst: der Spalt ist offen, bevor die Kamera ernsthaft
      // hineinfährt — sonst liest der Wechsel als Schnitt statt als Öffnen.
      set(st, st.door,   'door',   smooth(0.02, 0.24, p).toFixed(3));
      /* Der Fortschritt der Bühne selbst — Kapitelmarke, Fortschrittslinie
         und die Blende am Bühnenrand hängen daran. Eigenschaften erben,
         deshalb genügt es, ihn einmal oben an der Bühne zu setzen. */
      set(st, st.el,     'kapitel', p.toFixed(3));
    }
  }

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
  const spuren = [];
  if(!reduce){
    document.querySelectorAll('[data-weg]').forEach(el => spuren.push({ el, art:'weg',  wert:null }));
    document.querySelectorAll('[data-lauf]').forEach(el => spuren.push({ el, art:'lauf', wert:null }));
  }

  function updateMotion(){
    if(!spuren.length) return;
    const vh = window.innerHeight;
    for(const s of spuren){
      const r = s.el.getBoundingClientRect();
      const h = Math.max(1, r.height);
      const p = s.art === 'weg'
        ? clamp(-r.top / h, 0, 1)              // 0 = steht noch, 1 = ganz oben raus
        : clamp((vh - r.top) / (vh + h), 0, 1); // 0 = kommt unten herein, 1 = oben hinaus
      const w = p.toFixed(3);
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

    function quelleSetzen(){
      if(!film.src && film.dataset.src) film.src = film.dataset.src;
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

  /* ---- Übergang von der Übersicht auf die Detailseite ----
     Beim Klick öffnet sich die Szene (bei Logistik das Tor), die Kachel wächst
     über den Bildschirm und fährt ins Bild hinein; erst danach wird gewechselt.
     Animiert wird eine Kopie, damit das Raster darunter nicht umbricht. */
  document.querySelectorAll('.svc').forEach(karte=>{
    karte.addEventListener('click', (ev)=>{
      /* Modifiertasten, mittlere Maustaste und reduzierte Bewegung: normal folgen */
      if(reduce || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const ziel = karte.getAttribute('href');
      if(!ziel) return;
      ev.preventDefault();

      const r = karte.getBoundingClientRect();
      const klon = karte.cloneNode(true);
      klon.classList.add('svc--going');
      klon.style.top = r.top + 'px';
      klon.style.left = r.left + 'px';
      klon.style.width = r.width + 'px';
      klon.style.height = r.height + 'px';
      document.body.appendChild(klon);
      document.body.classList.add('svc-transit');

      setTimeout(()=>{
        window.location.href = ziel;
        /* Nur für die Einzeldatei-Vorschau nötig; im echten Mehrseiten-Aufbau
           ist das Dokument hier bereits ersetzt. */
        setTimeout(()=>{
          klon.remove();
          document.body.classList.remove('svc-transit');
        }, 300);
      }, 900);
    });
  });

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
      if(v.tooShort)  return 'Bitte etwas ausführlicher — mindestens ' + feld.minLength + ' Zeichen.';
      if(v.tooLong)   return 'Das ist zu lang — höchstens ' + feld.maxLength + ' Zeichen.';
      if(v.patternMismatch) return feld.dataset.fehler || 'Diese Eingabe passt nicht ins Format.';
      if(v.rangeUnderflow || v.badInput) return 'Diese Eingabe können wir nicht lesen.';
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
        '<p>' + (form.dataset.dankeText || 'Ihre Nachricht ist bei uns. Wir melden uns zeitnah zurück.') + '</p>' +
        '<a class="btn" href="tel:+494027075100">Oder direkt anrufen: +49 (40) 27075100</a>';
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
        melden('Das ging schnell — bitte noch einmal auf Senden klicken, dann geht es raus.');
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

  /* rAF-throttled scroll */
  let ticking = false;
  function onScroll(){
    onScrollTop();
    clearTimeout(nachleseZeit);
    nachleseZeit = setTimeout(nachlese, 160);
    if(!reduce && !ticking){
      ticking = true;
      requestAnimationFrame(()=>{
        updateStages(); updateMotion(); updateKino(); scrubVideos();
        ticking = false;
      });
    }
  }
  function alles(){ navHoehe(); updateStages(); updateMotion(); updateKino(); }
  window.addEventListener('scroll', onScroll, { passive:true });
  window.addEventListener('resize', ()=>{ onScrollTop(); if(!reduce) alles(); });
  onScrollTop(); if(!reduce) alles();
})();
