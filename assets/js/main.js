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
    setTimeout(fertig, 2050);          // Ende der Aufbau-Animation
    setTimeout(fertig, 3600);          // Notausstieg, falls etwas hängt
  })();

  /* Year */
  document.getElementById('year').textContent = new Date().getFullYear();

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

  /* Stat counters */
  const cio = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(!e.isIntersecting) return;
      const el = e.target, target = +el.dataset.count, suffix = el.dataset.suffix||'';
      let n=0; const step = Math.max(1, Math.round(target/40));
      const t = setInterval(()=>{ n+=step; if(n>=target){ n=target; clearInterval(t); } el.textContent = n+suffix; }, 26);
      cio.unobserve(el);
    });
  }, { threshold:.6 });
  document.querySelectorAll('[data-count]').forEach(el=> cio.observe(el));

  /* Hero parallax (mouse) */
  const orbs = [...document.querySelectorAll('.orb')];
  if(!reduce){
    window.addEventListener('mousemove', (ev)=>{
      const cx = (ev.clientX/window.innerWidth - .5), cy = (ev.clientY/window.innerHeight - .5);
      orbs.forEach(o=>{ const d = +o.dataset.depth*90; o.style.transform = `translate(${cx*d}px,${cy*d}px)`; });
    }, { passive:true });
  }

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
