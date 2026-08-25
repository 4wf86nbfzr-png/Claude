import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderScreen } from "@/features/tracking/OrderScreen";
import { Skeleton } from "@/components/ui/Skeleton";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Bestellung ${id}`, robots: { index: false, follow: false } };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="shell space-y-4 pb-24 pt-28 lg:pt-36">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      }
    >
      <OrderScreen orderId={id} />
    </Suspense>
  );
}
