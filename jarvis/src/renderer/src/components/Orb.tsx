import type { CSSProperties, ReactElement } from 'react'
import type { JarvisState } from '@shared/types'

interface OrbProps {
  state: JarvisState
  /** Lautstärkepegel 0..1 — lässt den Kern beim Sprechen und Zuhören atmen. */
  level: number
  onClick?: () => void
  title?: string
}

/**
 * Der Orb ist die einzige dauerhaft sichtbare Bewegung — und auch die nur,
 * wenn tatsächlich etwas passiert. Im Ruhezustand steht er still.
 */
export function Orb({ state, level, onClick, title }: OrbProps): ReactElement {
  const style = { '--level': String(Math.max(0, Math.min(1, level))) } as CSSProperties

  return (
    <button
      type="button"
      className="orb"
      data-state={state}
      style={style}
      onClick={onClick}
      title={title ?? 'Mikrofon ein- oder ausschalten'}
      aria-label={title ?? 'Mikrofon ein- oder ausschalten'}
    >
      <span className="orb__ring" aria-hidden="true" />
      <span className="orb__core" aria-hidden="true" />
    </button>
  )
}
