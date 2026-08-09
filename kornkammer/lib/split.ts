/**
 * Zeilenweises Aufteilen von Text — ohne SplitType als Abhaengigkeit.
 *
 * Der Trick: jedes Wort kurz in ein Inline-Element packen, die tatsaechliche
 * Y-Position messen und Woerter mit gleicher Position zu einer Zeile bündeln.
 * Damit stimmt die Aufteilung auch nach einem Breakpoint-Wechsel, weil wir
 * neu messen statt zu raten.
 */

export type SplitResult = {
  lines: HTMLElement[]
  inners: HTMLElement[]
  revert: () => void
}

export function splitLines(el: HTMLElement): SplitResult {
  const original = el.innerHTML

  // Woerter markieren
  const words = el.textContent?.split(/(\s+)/) ?? []
  el.innerHTML = ''
  const probes: HTMLElement[] = []
  for (const w of words) {
    if (/^\s+$/.test(w)) {
      el.appendChild(document.createTextNode(w))
      continue
    }
    if (!w) continue
    const s = document.createElement('span')
    s.style.display = 'inline-block'
    s.textContent = w
    el.appendChild(s)
    probes.push(s)
  }

  // Nach Y-Position gruppieren
  const rows = new Map<number, string[]>()
  for (const p of probes) {
    const top = Math.round(p.offsetTop)
    if (!rows.has(top)) rows.set(top, [])
    rows.get(top)!.push(p.textContent ?? '')
  }

  const lines: HTMLElement[] = []
  const inners: HTMLElement[] = []
  el.innerHTML = ''
  for (const [, wordsInRow] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const line = document.createElement('span')
    line.className = 'split-line'
    const inner = document.createElement('span')
    inner.textContent = wordsInRow.join(' ')
    line.appendChild(inner)
    el.appendChild(line)
    lines.push(line)
    inners.push(inner)
  }

  return {
    lines,
    inners,
    revert: () => {
      el.innerHTML = original
    },
  }
}
