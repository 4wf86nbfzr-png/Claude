import { Suspense } from "react";
import { Verify } from "./verify";

export const metadata = { title: "Mail bestätigen", robots: { index: false } };

export default function Bestaetigen() {
  return <div className="mx-auto max-w-md px-4 py-14"><h1 className="text-3xl font-semibold">Mail bestätigen</h1><Suspense><Verify /></Suspense></div>;
}
