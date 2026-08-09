'use client'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * GSAP wird genau einmal registriert. Mehrfachregistrierung ist zwar
 * harmlos, macht aber die Reihenfolge der Plugins schwer nachvollziehbar.
 */
let registered = false

if (typeof window !== 'undefined' && !registered) {
  gsap.registerPlugin(ScrollTrigger)
  // Werte auf drei Nachkommastellen runden: weniger Layout-Arbeit pro Frame.
  gsap.config({ nullTargetWarn: false })
  gsap.defaults({ overwrite: 'auto' })
  registered = true
}

export { gsap, ScrollTrigger }
