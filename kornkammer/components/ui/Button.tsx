import Link from 'next/link'
import MagneticButton from '@/components/motion/MagneticButton'

type Props = {
  href: string
  children: React.ReactNode
  /** Externe Ziele bekommen einen sichtbaren Hinweis */
  external?: boolean
  variant?: 'solid' | 'ghost'
  className?: string
}

export default function Button({
  href,
  children,
  external = false,
  variant = 'solid',
  className,
}: Props) {
  const base =
    'group inline-flex items-center gap-3 rounded-full px-7 py-3.5 text-[0.95rem] leading-none transition-colors duration-300 ease-[var(--ease-swift)]'
  const look =
    variant === 'solid'
      ? 'bg-paper text-soil hover:bg-wheat'
      : 'border border-[var(--hair-strong)] text-current hover:border-current'

  const inner = (
    <>
      <span>{children}</span>
      <span
        aria-hidden
        className="translate-x-0 transition-transform duration-300 ease-[var(--ease-swift)] group-hover:translate-x-1"
      >
        {external ? '↗' : '→'}
      </span>
    </>
  )

  if (external) {
    return (
      <MagneticButton className={className}>
        <a href={href} target="_blank" rel="noopener noreferrer" className={`${base} ${look}`}>
          {inner}
          <span className="sr-only">(öffnet in einem neuen Tab)</span>
        </a>
      </MagneticButton>
    )
  }

  return (
    <MagneticButton className={className}>
      <Link href={href} className={`${base} ${look}`}>
        {inner}
      </Link>
    </MagneticButton>
  )
}
