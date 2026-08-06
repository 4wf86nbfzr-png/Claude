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

  /* Mobile menu */
  const burger = document.getElementById('burger');
  burger.addEventListener('click', ()=>{
    const open = document.body.classList.toggle('menu-open');
    burger.setAttribute('aria-expanded', open);
    document.body.classList.toggle('locked', open);
  });
  document.querySelectorAll('#mobileMenu a').forEach(a=> a.addEventListener('click', ()=>{
    document.body.classList.remove('menu-open','locked');
    burger.setAttribute('aria-expanded', false);
  }));

  /* Eintritte beim Scrollen. Gruppen mit data-stagger bekommen pro Kind einen
     Index, damit sie nacheinander statt gleichzeitig erscheinen — das gibt dem
     Abschnitt einen Takt, statt alles auf einen Schlag zu zeigen. */
  document.querySelectorAll('[data-stagger]').forEach(gruppe=>{
    [...gruppe.children].forEach((kind, i)=> kind.style.setProperty('--i', i));
  });
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold:.16, rootMargin:'0px 0px -8% 0px' });
  document.querySelectorAll('.reveal-up, [data-stagger]').forEach(el=> io.observe(el));

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
    last:   { zoom:null, detail:null, panel:null, door:null },
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

    /* Nur im Viewport laufen lassen */
    const fio = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          if(vonSelbst){
            quelleSetzen();
            if(!vomNutzerPausiert) film.play().then(knopfStand).catch(()=>{});
          }
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
          quelleSetzen();
          film.play().then(knopfStand).catch(knopfStand);
        } else {
          vomNutzerPausiert = true;
          film.pause();
        }
        knopfStand();
      });
    }
    film.addEventListener('play', knopfStand);
    film.addEventListener('pause', knopfStand);

    /* Tonschalter erscheint nur, wenn der Film überhaupt eine Tonspur hat.
       Der Platzhalterfilm hat keine — dann wäre der Knopf eine Lüge. */
    if(btnTon){
      if(film.hasAttribute('data-ohne-ton')){
        btnTon.remove();
      } else {
        btnTon.hidden = false;
        btnTon.addEventListener('click', ()=>{
          film.muted = !film.muted;
          btnTon.querySelector('span').textContent = film.muted ? 'Ton an' : 'Ton aus';
          btnTon.setAttribute('aria-label', film.muted ? 'Ton einschalten' : 'Ton ausschalten');
        });
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

  /* ---- Anfrageformular ----
     Vorher stand am <form> action="mailto:… " method="post". Das ist kein
     unterstützter Weg: Chrome und Edge tun daraufhin schlicht nichts, die
     Anfrage war weg. Bis ein echter Dienst (Formspree, Netlify Forms, eigenes
     Backend) angebunden ist, setzen wir hier eine ordentlich formatierte
     mailto-Nachricht zusammen und öffnen das Mailprogramm — mit einer
     sichtbaren Rückmeldung, damit niemand im Unklaren bleibt.

     UMSTELLUNG AUF EINEN DIENST: am <form> data-endpunkt="https://…" setzen.
     Dann wird abgeschickt statt eine Mail zu öffnen. */
  (function(){
    const form = document.querySelector('form[data-anfrage]');
    if(!form) return;
    const status = form.querySelector('.form__status');
    const empfaenger = form.dataset.empfaenger || 'info@hermserviceteam.com';

    function melden(text, stand){
      if(!status) return;
      status.textContent = text;
      status.dataset.stand = stand || 'ok';
    }

    form.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      if(!form.reportValidity()) return;
      const daten = new FormData(form);

      const endpunkt = form.dataset.endpunkt;
      if(endpunkt){
        melden('Wird gesendet …');
        try{
          const antwort = await fetch(endpunkt, { method:'POST', body:daten, headers:{ 'Accept':'application/json' } });
          if(!antwort.ok) throw new Error(antwort.status);
          form.reset();
          melden('Danke — Ihre Anfrage ist bei uns. Wir melden uns.');
        }catch(e){
          melden('Das hat nicht geklappt. Bitte rufen Sie uns an: +49 (40) 27075100', 'fehler');
        }
        return;
      }

      /* Ohne Endpunkt: Mailprogramm mit fertigem Text öffnen. */
      const zeilen = [];
      for(const [feld, wert] of daten.entries()){
        if(String(wert).trim()) zeilen.push(feld + ': ' + wert);
      }
      const betreff = 'Anfrage über die Website' + (daten.get('Bereich') ? ' — ' + daten.get('Bereich') : '');
      const link = 'mailto:' + empfaenger
        + '?subject=' + encodeURIComponent(betreff)
        + '&body=' + encodeURIComponent(zeilen.join('\n'));
      window.location.href = link;
      melden('Ihr E-Mail-Programm öffnet sich mit der fertigen Anfrage. Klappt das nicht, schreiben Sie an ' + empfaenger + '.');
    });
  })();

  /* rAF-throttled scroll */
  let ticking = false;
  function onScroll(){
    onScrollTop();
    if(!reduce && !ticking){ ticking = true; requestAnimationFrame(()=>{ updateStages(); scrubVideos(); ticking=false; }); }
  }
  window.addEventListener('scroll', onScroll, { passive:true });
  window.addEventListener('resize', ()=>{ onScrollTop(); if(!reduce) updateStages(); });
  onScrollTop(); if(!reduce) updateStages();
})();
