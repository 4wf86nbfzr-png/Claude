import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BuilderScreen } from "@/features/builder/BuilderScreen";
import { BUILDER_CATEGORIES, getCategoryBySlug } from "@/data/categories";
import { Skeleton } from "@/components/ui/Skeleton";

export function generateStaticParams() {
  return BUILDER_CATEGORIES.map((c) => ({ kategorie: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kategorie: string }>;
}): Promise<Metadata> {
  const { kategorie } = await params;
  const category = getCategoryBySlug(kategorie);
  if (!category) return { title: "Nicht gefunden" };
  return {
    title: `${category.name} bauen`,
    description: category.description,
  };
}

export default async function BuilderPage({ params }: { params: Promise<{ kategorie: string }> }) {
  const { kategorie } = await params;
  const category = getCategoryBySlug(kategorie);
  if (!category || category.simple) notFound();

  return (
    <div className="shell pt-20 lg:pt-24">
      <div className="flex items-center justify-between gap-4 py-4">
        <Link
          href="/menue"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-paper"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Menue
        </Link>
        <nav aria-label="Kategorie wechseln" className="flex gap-1.5">
          {BUILDER_CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`/bauen/${c.slug}`}
              aria-current={c.id === category.id ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                c.id === category.id ? "bg-white/[0.08] text-paper" : "text-muted hover:text-paper"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </div>

      <Suspense
        fallback={
          <div className="grid gap-8 py-10 lg:grid-cols-2">
            <Skeleton className="aspect-square w-full rounded-full" />
            <div className="space-y-4">
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </div>
        }
      >
        <BuilderScreen categoryId={category.id} />
      </Suspense>
    </div>
  );
}
