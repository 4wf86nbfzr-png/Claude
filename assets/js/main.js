/* ============================================================
   HST Relaunch — interactions
   ============================================================ */
(function(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Preloader */
  window.addEventListener('load', ()=> setTimeout(()=> document.getElementById('preloader').classList.add('done'), 900));
  setTimeout(()=> document.getElementById('preloader').classList.add('done'), 3000); // failsafe

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

  /* Reveal on scroll */
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold:.16, rootMargin:'0px 0px -8% 0px' });
  document.querySelectorAll('.reveal-up').forEach(el=> io.observe(el));

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
  const stages = [...document.querySelectorAll('.stage')];

  function updateStages(){
    const vh = window.innerHeight;
    for(const st of stages){
      const rect = st.getBoundingClientRect();
      const total = st.offsetHeight - vh;
      const p = clamp((-rect.top) / total, 0, 1);
      const scene  = st.querySelector('.scene');
      const detail = st.querySelector('.detail');
      const panel  = st.querySelector('.panel');
      const door   = st.querySelector('.door');
      // zoom in as we scroll through
      scene.style.setProperty('--zoom', (1 + p*1.7).toFixed(3));
      // detail (interior/closeup) cross-fades in
      if(detail) detail.style.setProperty('--detail', smooth(0.34, 0.62, p).toFixed(3));
      // panel reveals last
      panel.style.setProperty('--panel', smooth(0.5, 0.82, p).toFixed(3));
      // fahrservice door opens early
      if(door) door.style.setProperty('--door', smooth(0.06, 0.34, p).toFixed(3));
    }
  }

  /* rAF-throttled scroll */
  let ticking = false;
  function onScroll(){
    onScrollTop();
    if(!reduce && !ticking){ ticking = true; requestAnimationFrame(()=>{ updateStages(); ticking=false; }); }
  }
  window.addEventListener('scroll', onScroll, { passive:true });
  window.addEventListener('resize', ()=>{ onScrollTop(); if(!reduce) updateStages(); });
  onScrollTop(); if(!reduce) updateStages();
})();
