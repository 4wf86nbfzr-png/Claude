import type { LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

/**
 * Leerzustaende sind hier keine Restekiste: gleiche Typo-Hierarchie wie
 * der Rest, immer mit genau einem naechsten Schritt.
 */
export function EmptyState({
  icon: Icon,
  kicker,
  title,
  description,
  actionLabel,
  actionHref,
  children,
}: {
  icon: LucideIcon;
  kicker?: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-20 text-center">
      <span className="mb-6 grid size-16 place-items-center rounded-2xl border border-line bg-ink-2">
        <Icon className="size-7 text-muted" aria-hidden />
      </span>
      {kicker && <p className="kicker mb-3">{kicker}</p>}
      <h2 className="display display-m">{title}</h2>
      <p className="mt-4 text-sm leading-relaxed text-muted">{description}</p>
      {actionLabel && actionHref && (
        <ButtonLink href={actionHref} size="lg" className="mt-8">
          {actionLabel}
        </ButtonLink>
      )}
      {children}
    </div>
  );
}
