import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Kein kuenstlicher Ladebildschirm: nur eine ruhige Platzhalterstruktur,
 * die sofort verschwindet, sobald die Seite steht.
 */
export default function Loading() {
  return (
    <div className="shell pb-24 pt-28 lg:pt-36" aria-busy="true" aria-live="polite">
      <span className="sr-only">Seite wird geladen</span>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-16 w-2/3 max-w-xl" />
      <Skeleton className="mt-6 h-4 w-full max-w-md" />
      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="aspect-[4/5] w-full" />
        <Skeleton className="aspect-[4/5] w-full" />
        <Skeleton className="aspect-[4/5] w-full" />
      </div>
    </div>
  );
}
