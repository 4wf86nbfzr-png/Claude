'use client'

import { useEffect, useRef } from 'react'

/**
 * Der eine WebGL-Moment der Seite.
 *
 * Ueber dem Hero liegt eine feine, bewegte Kornschicht mit Vignette. Sie
 * legt sich wie Filmkorn ueber das Bild, driftet traege dem Zeiger nach und
 * wird beim Scrollen dichter. Bewusst handgeschrieben statt three.js:
 * ein Fragment-Shader auf zwei Dreiecken braucht keine Bibliothek.
 *
 * Laeuft nur, solange der Hero sichtbar ist, und gar nicht bei reduzierter
 * Bewegung oder ohne WebGL.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision mediump float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uPointer;   // -1 .. 1
uniform float uAmount;    // Korndichte, waechst beim Scrollen

// Billiges, stabiles Rauschen. Kein Textur-Upload noetig.
float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;

  // Korn driftet leicht mit dem Zeiger, damit die Flaeche nicht tot wirkt.
  vec2 drift = uPointer * 0.012;
  vec2 gp = (uv + drift) * uRes / 1.35;
  float t = floor(uTime * 24.0);          // auf 24 Bilder je Sekunde rasten
  float g = hash(gp + t);

  // Vignette: aussen mehr Korn, Mitte bleibt ruhig
  vec2 c = uv - 0.5;
  float vign = smoothstep(0.18, 0.86, length(c));

  float grain = (g - 0.5) * (0.055 + 0.075 * vign) * uAmount;

  gl_FragColor = vec4(vec3(0.5 + grain), 1.0);
}
`

export default function GrainCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'uRes')
    const uTime = gl.getUniformLocation(prog, 'uTime')
    const uPointer = gl.getUniformLocation(prog, 'uPointer')
    const uAmount = gl.getUniformLocation(prog, 'uAmount')

    // Auf hochauflösenden Displays reicht die halbe Pixeldichte: Korn ist
    // Rauschen, da sieht niemand den Unterschied, es kostet aber Fuellrate.
    const dpr = () => Math.min(window.devicePixelRatio || 1, 1.5)

    const resize = () => {
      const w = Math.floor(canvas.clientWidth * dpr())
      const h = Math.floor(canvas.clientHeight * dpr())
      if (canvas.width === w && canvas.height === h) return
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    const onPointer = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    let running = true
    const io = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting
        if (running) frame(performance.now())
      },
      { threshold: 0 },
    )
    io.observe(canvas)

    let raf = 0
    const start = performance.now()

    const frame = (now: number) => {
      if (!running) return
      pointer.x += (pointer.tx - pointer.x) * 0.05
      pointer.y += (pointer.ty - pointer.y) * 0.05

      // Beim Verlassen des Heros wird das Korn dichter.
      const progress = Math.min(1, window.scrollY / Math.max(1, window.innerHeight))

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, (now - start) / 1000)
      gl.uniform2f(uPointer, pointer.x, pointer.y)
      gl.uniform1f(uAmount, 0.85 + progress * 0.9)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ mixBlendMode: 'overlay', opacity: 0.5 }}
    />
  )
}
