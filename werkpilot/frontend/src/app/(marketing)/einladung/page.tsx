import { Suspense } from "react";
import { Accept } from "./accept";
export const metadata = { title: "Einladung", robots: { index: false } };
export default function Page() { return <div className="mx-auto max-w-md px-4 py-14"><h1 className="text-3xl font-semibold">Einladung annehmen</h1><Suspense><Accept /></Suspense></div>; }
