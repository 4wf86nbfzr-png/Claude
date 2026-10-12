import { Suspense } from "react";
import { Verify } from "./verify";

export const metadata = { title: "E-Mail bestätigen", robots: { index: false } };

export default function Bestaetigen() {
  return <div className="mx-auto max-w-md px-4 py-14"><h1 className="text-3xl font-semibold">E-Mail bestätigen</h1><Suspense><Verify /></Suspense></div>;
}
