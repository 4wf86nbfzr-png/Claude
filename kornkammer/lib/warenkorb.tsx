'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'
import { ARTIKEL, variante } from '@/data/shop'

/**
 * Der Warenkorb.
 *
 * Zwei Dinge sind hier wichtiger als alles andere:
 *
 * 1. Der erste Renderdurchgang auf dem Client muss dem des Servers gleichen.
 *    Der gespeicherte Inhalt kommt deshalb erst in einem Effekt dazu, und bis
 *    dahin meldet `bereit` false. Wer das ueberspringt, bekommt einen
 *    Hydrationsfehler und React wirft den betroffenen Teilbaum weg — auf
 *    dieser Seite ist genau daran schon einmal das Hero-Video gestorben.
 *
 * 2. Gerechnet wird in Cent, nie in Euro als Kommazahl.
 */

export type Position = {
  /** Varianten-Kennung aus data/shop.ts */
  id: string
  anzahl: number
}

type Aktion =
  | { typ: 'laden'; positionen: Position[] }
  | { typ: 'hinzu'; id: string; anzahl?: number }
  | { typ: 'setzen'; id: string; anzahl: number }
  | { typ: 'entfernen'; id: string }
  | { typ: 'leeren' }

const MAX = 99
const SPEICHER = 'kornkammer.warenkorb.v1'

function reducer(state: Position[], aktion: Aktion): Position[] {
  switch (aktion.typ) {
    case 'laden':
      return aktion.positionen

    case 'hinzu': {
      const vorhanden = state.find((p) => p.id === aktion.id)
      const plus = aktion.anzahl ?? 1
      if (vorhanden) {
        return state.map((p) =>
          p.id === aktion.id ? { ...p, anzahl: Math.min(MAX, p.anzahl + plus) } : p,
        )
      }
      return [...state, { id: aktion.id, anzahl: Math.min(MAX, plus) }]
    }

    case 'setzen': {
      if (aktion.anzahl <= 0) return state.filter((p) => p.id !== aktion.id)
      return state.map((p) =>
        p.id === aktion.id ? { ...p, anzahl: Math.min(MAX, aktion.anzahl) } : p,
      )
    }

    case 'entfernen':
      return state.filter((p) => p.id !== aktion.id)

    case 'leeren':
      return []
  }
}

type Kontext = {
  positionen: Position[]
  /** Erst true, wenn der gespeicherte Stand eingelesen ist. */
  bereit: boolean
  anzahlGesamt: number
  summeCent: number
  /** Liegt etwas ohne Preis im Korb? Dann ist die Summe unvollstaendig. */
  ohnePreis: boolean
  hinzu: (id: string, anzahl?: number) => void
  setzen: (id: string, anzahl: number) => void
  entfernen: (id: string) => void
  leeren: () => void
  /** Zaehler, der bei jedem Hinzufuegen steigt — Anlass fuer die Animation. */
  puls: number
  offen: boolean
  oeffnen: () => void
  schliessen: () => void
}

const WarenkorbKontext = createContext<Kontext | null>(null)

/** Nur Kennungen behalten, die es im Sortiment wirklich gibt. */
function saeubern(roh: unknown): Position[] {
  if (!Array.isArray(roh)) return []
  const gueltig = new Set(ARTIKEL.flatMap((a) => a.varianten.map((v) => v.id)))
  const raus: Position[] = []
  for (const eintrag of roh) {
    if (!eintrag || typeof eintrag !== 'object') continue
    const { id, anzahl } = eintrag as Record<string, unknown>
    if (typeof id !== 'string' || !gueltig.has(id)) continue
    const n = typeof anzahl === 'number' && Number.isFinite(anzahl) ? Math.floor(anzahl) : 0
    if (n < 1) continue
    raus.push({ id, anzahl: Math.min(MAX, n) })
  }
  return raus
}

export function WarenkorbProvider({ children }: { children: React.ReactNode }) {
  const [positionen, dispatch] = useReducer(reducer, [])
  const [bereit, setBereit] = useState(false)
  const [puls, setPuls] = useState(0)
  const [offen, setOffen] = useState(false)

  /* Einlesen erst nach dem Einhaengen — siehe Kopfkommentar. */
  useEffect(() => {
    try {
      const roh = window.localStorage.getItem(SPEICHER)
      if (roh) dispatch({ typ: 'laden', positionen: saeubern(JSON.parse(roh)) })
    } catch {
      /* Privater Modus oder voller Speicher. Dann eben ohne. */
    }
    setBereit(true)
  }, [])

  useEffect(() => {
    if (!bereit) return
    try {
      window.localStorage.setItem(SPEICHER, JSON.stringify(positionen))
    } catch {
      /* siehe oben */
    }
  }, [positionen, bereit])

  /* Solange die Schublade offen ist, soll die Seite dahinter nicht scrollen. */
  useEffect(() => {
    if (!offen) return
    const vorher = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = vorher
    }
  }, [offen])

  const hinzu = useCallback((id: string, anzahl = 1) => {
    dispatch({ typ: 'hinzu', id, anzahl })
    setPuls((p) => p + 1)
  }, [])

  const setzen = useCallback((id: string, anzahl: number) => {
    dispatch({ typ: 'setzen', id, anzahl })
  }, [])

  const entfernen = useCallback((id: string) => {
    dispatch({ typ: 'entfernen', id })
  }, [])

  const leeren = useCallback(() => {
    dispatch({ typ: 'leeren' })
  }, [])

  const wert = useMemo<Kontext>(() => {
    let summeCent = 0
    let ohnePreis = false
    let anzahlGesamt = 0

    for (const p of positionen) {
      anzahlGesamt += p.anzahl
      const treffer = variante(p.id)
      const cent = treffer?.variante.preisCent
      if (typeof cent === 'number') summeCent += cent * p.anzahl
      else ohnePreis = true
    }

    return {
      positionen,
      bereit,
      anzahlGesamt,
      summeCent,
      ohnePreis,
      hinzu,
      setzen,
      entfernen,
      leeren,
      puls,
      offen,
      oeffnen: () => setOffen(true),
      schliessen: () => setOffen(false),
    }
  }, [positionen, bereit, hinzu, setzen, entfernen, leeren, puls, offen])

  return <WarenkorbKontext.Provider value={wert}>{children}</WarenkorbKontext.Provider>
}

export function useWarenkorb() {
  const kontext = useContext(WarenkorbKontext)
  if (!kontext) throw new Error('useWarenkorb braucht den WarenkorbProvider')
  return kontext
}
