'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { MOTION, prefersReducedMotion } from '@/lib/motion'
import GrainCanvas from '@/components/motion/GrainCanvas'
import SplitLines from '@/components/motion/SplitLines'
import Eyebrow from '@/components/ui/Eyebrow'
import { FARM } from '@/data/farm'

/**
 * DER EINSTIEG
 *
 * Erstes sichtbares Element ist das Video. Kein Bild davor, kein Ladefries.
 * Beim Scrollen bleibt es gepinnt: der Ausschnitt zoomt minimal zurueck, ein
 * dunkler Verlauf waechst von unten, und der Titel loest sich Zeile fuer
 * Zeile auf, waehrend die naechste Sektion darunter hervorkommt.
 *
 * Zur Aufloesung: Der Clip ist Hochformat. Auf Desktop deckt `object-fit:
 * cover` mit Fokus Mitte, damit der Traktor im Bild bleibt. Ein spaeterer
 * Querformat-Master kann unter denselben Dateinamen abgelegt werden, ohne
 * dass hier etwas zu aendern waere.
 *
 * Die Wiedergabeposition an den Scrollfortschritt zu koppeln (scrub) waere
 * moeglich, laeuft bei dieser Aufloesung aber nicht ruckelfrei: der Browser
 * muss dafuer staendig neu suchen. Deshalb sanftes Autoplay im Loop plus
 * Scale- und Masken-Reveal, wie in der Vorgabe als Alternative vorgesehen.
 */

/** Auslieferungsstufen des Heros. 4K nur, wo es sich lohnt. */
const SOURCES = {
  sd: { webm: '/video/hero.webm', mp4: '/video/hero.mp4' },
  hd: { webm: '/video/hero-2k.webm', mp4: '/video/hero-2k.mp4' },
  uhd: { webm: '/video/hero-4k.webm', mp4: '/video/hero-4k.mp4' },
}

/**
 * Die Quellen setzt ein synchrones Inline-Skript direkt hinter dem
 * `<video>`, nicht erst React.
 *
 * Grund: Stehen `<source>`-Elemente im ausgelieferten Markup, beginnt der
 * Browser sofort zu laden. Ein spaeterer Tausch in `useEffect` haette die
 * passende Stufe zusaetzlich geholt — auf dem Laptop also 2K und 4K
 * hintereinander. Das Skript laeuft waehrend des Parsens, bevor das
 * Videoelement Kinder hat, und es wird genau eine Datei angefordert.
 *
 * Ohne JavaScript bleibt es beim Poster. Das ist dieselbe Darstellung, die
 * auch bei reduzierter Bewegung vorgesehen ist.
 */
const QUELLENWAHL = `
(function () {
  var v = document.getElementById('hero-video');
  if (!v) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var S = ${JSON.stringify(SOURCES)};
  var c = navigator.connection || {};
  var tier;
  if (c.saveData) tier = 'sd';
  else if (c.effectiveType && /(slow-)?2g|^3g$/.test(c.effectiveType)) tier = 'sd';
  else {
    // Cover auf einem Hochformat-Clip: die Breite entscheidet, nicht die Hoehe.
    var needed = window.innerWidth * (window.devicePixelRatio || 1);
    tier = needed > 1800 ? 'uhd' : needed > 700 ? 'hd' : 'sd';
  }

  // Format hier aushandeln statt ueber <source>-Kinder: die wuerden React
  // bei der Hydration als fremdes Markup auffallen. Ein gesetztes src-Attribut
  // stoert nicht, weil React dieses Prop nie selbst rendert.
  var webmOk = v.canPlayType('video/webm; codecs="vp9"');
  v.src = webmOk === 'probably' || webmOk === 'maybe' ? S[tier].webm : S[tier].mp4;
  v.load();
})();
`

export default function Hero() {
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const veil = useRef<HTMLDivElement>(null)
  const copy = useRef<HTMLDivElement>(null)
  const [ruhig, setRuhig] = useState(false)

  /* Die Quellen hat das Inline-Skript bereits gesetzt. Hier bleibt nur, den
     ruhigen Modus zu merken und das Abspielen anzustossen, falls der Browser
     Autoplay verweigert hat. */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (prefersReducedMotion()) {
      setRuhig(true)
      video.autoplay = false
      video.pause()
      return
    }

    // Wird Autoplay abgelehnt, bleibt schlicht das Poster stehen.
    video.play().catch(() => {})
  }, [])

  /* Die Kamerafahrt beim Verlassen des Heros. */
  useEffect(() => {
    const el = root.current
    if (!el || prefersReducedMotion()) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.7,
          pin: stage.current,
          pinSpacing: false,
          anticipatePin: 1,
        },
      })

      // Ausschnitt zoomt minimal zurueck
      tl.fromTo(videoRef.current, { scale: 1.12 }, { scale: 1, ease: 'none' }, 0)
      // Verlauf waechst von unten nach oben
      tl.fromTo(veil.current, { opacity: 0.25 }, { opacity: 1, ease: 'none' }, 0)
      // Titel verabschiedet sich Zeile fuer Zeile
      tl.to(
        copy.current ? Array.from(copy.current.querySelectorAll('.split-line > span, [data-fade]')) : [],
        { yPercent: -70, autoAlpha: 0, ease: 'none', stagger: MOTION.staggerTight },
        0.05,
      )
    }, el)

    return () => ctx.revert()
  }, [])

  /* Der Hinweis am unteren Rand verschwindet, sobald gescrollt wird. */
  useEffect(() => {
    if (prefersReducedMotion()) return
    const cue = root.current?.querySelector('[data-cue]')
    if (!cue) return
    const t = gsap.to(cue, {
      autoAlpha: 0,
      duration: 0.4,
      scrollTrigger: { trigger: root.current, start: 'top+=40 top', toggleActions: 'play none none reverse' },
    })
    return () => {
      t.scrollTrigger?.kill()
      t.kill()
    }
  }, [])

  return (
    // Ohne Kamerafahrt braucht der Hero auch keinen zusaetzlichen Scrollweg.
    <div ref={root} className={ruhig ? 'relative h-[100svh]' : 'relative h-[190svh]'}>
      <div ref={stage} className="relative h-[100svh] w-full overflow-hidden bg-soilDeep">
        <video
          id="hero-video"
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/video/hero-poster.webp"
          aria-label="Feldarbeit in der Dämmerung: ein Traktor zieht mit Scheinwerferlicht seine Bahn."
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: '50% 50%' }}
          suppressHydrationWarning
        />
        <script dangerouslySetInnerHTML={{ __html: QUELLENWAHL }} />

        {/* Verlauf von unten: traegt die Typografie, ohne das Bild zuzudecken */}
        <div
          ref={veil}
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, var(--soil) 0%, rgba(13,10,6,0.82) 26%, rgba(13,10,6,0.28) 58%, rgba(13,10,6,0.34) 100%)',
          }}
        />

        <GrainCanvas className="pointer-events-none absolute inset-0 h-full w-full" />

        {/* Titel */}
        <div className="absolute inset-0 flex items-end">
          <div ref={copy} className="shell w-full pb-[clamp(3.5rem,9vh,7rem)]">
            <SplitLines
              as="h1"
              immediate
              delay={0.25}
              className="optical no-break text-[clamp(2.5rem,11.2vw,9rem)] uppercase leading-[0.86] tracking-[-0.03em]"
            >
              Team Kornkammer
            </SplitLines>

            <SplitLines
              as="p"
              immediate
              delay={0.5}
              className="mt-3 text-h3 u-italic text-wheatSoft"
            >
              Bio aus dem Revier
            </SplitLines>

            <div data-fade className="mt-8">
              <Eyebrow items={[...FARM.certifications]} />
            </div>
          </div>
        </div>

        {/* Scrollhinweis */}
        <div
          data-cue
          className="pointer-events-none absolute bottom-6 right-[var(--gutter)] flex items-center gap-3"
        >
          <span className="u-mono text-[color:var(--stone)]">Scrollen</span>
          <span aria-hidden className="block h-10 w-px bg-[var(--hair-strong)]" />
        </div>
      </div>
    </div>
  )
}

export { ScrollTrigger }
