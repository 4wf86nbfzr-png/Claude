/**
 * Zeilenweises Aufteilen von Text — ohne SplitType als Abhaengigkeit.
 *
 * Der Trick: jedes Wort kurz in ein Inline-Element packen, die tatsaechliche
 * Y-Position messen und Woerter mit gleicher Position zu einer Zeile bündeln.
 * Damit stimmt die Aufteilung auch nach einem Breakpoint-Wechsel, weil wir
 * neu messen statt zu raten.
 *
 * Der Trenner zwischen zwei Woertern wird dabei mitgefuehrt und nicht durch
 * ein normales Leerzeichen ersetzt: ein geschuetztes Leerzeichen im Titel
 * wuerde sonst zu einer Stelle, an der die Zeile doch umbrechen darf.
 */

export type SplitResult = {
  lines: HTMLElement[]
  inners: HTMLElement[]
  revert: () => void
}

type Token = { word: string; after: string }

export function splitLines(el: HTMLElement): SplitResult {
  const original = el.innerHTML
  const text = el.textContent ?? ''

  // In Wort plus nachfolgenden Trenner zerlegen
  const tokens: Token[] = []
  const re = /(\S+)(\s*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    tokens.push({ word: m[1], after: m[2] })
  }
  if (tokens.length === 0) {
    return { lines: [], inners: [], revert: () => { el.innerHTML = original } }
  }

  // Messphase: jedes Wort einzeln, damit sich die Y-Position ablesen laesst
  el.innerHTML = ''
  const probes: HTMLElement[] = []
  for (const t of tokens) {
    const s = document.createElement('span')
    s.style.display = 'inline-block'
    s.textContent = t.word
    el.appendChild(s)
    probes.push(s)
    if (t.after) el.appendChild(document.createTextNode(t.after))
  }

  // Nach Y-Position gruppieren
  const rows: Token[][] = []
  let lastTop: number | null = null
  probes.forEach((p, i) => {
    const top = Math.round(p.offsetTop)
    if (lastTop === null || top !== lastTop) {
      rows.push([])
      lastTop = top
    }
    rows[rows.length - 1].push(tokens[i])
  })

  // Aufbauphase
  const lines: HTMLElement[] = []
  const inners: HTMLElement[] = []
  el.innerHTML = ''
  rows.forEach((row, rowIndex) => {
    const line = document.createElement('span')
    line.className = 'split-line'
    const inner = document.createElement('span')
    inner.textContent = row
      .map((t, i) => {
        // Der Trenner am Zeilenende faellt weg, alle anderen bleiben erhalten.
        const last = i === row.length - 1
        return last ? t.word : t.word + (t.after || ' ')
      })
      .join('')
    line.appendChild(inner)
    el.appendChild(line)
    lines.push(line)
    inners.push(inner)
    void rowIndex
  })

  return {
    lines,
    inners,
    revert: () => {
      el.innerHTML = original
    },
  }
}
