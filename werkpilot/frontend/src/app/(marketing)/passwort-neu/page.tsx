import { Suspense } from "react";
import { ResetForm } from "./reset-form";
export const metadata = { title: "Neues Passwort", robots: { index: false } };
export default function Page() { return <div className="mx-auto max-w-md px-4 py-14"><h1 className="text-3xl font-semibold">Neues Passwort</h1><Suspense><ResetForm /></Suspense></div>; }
