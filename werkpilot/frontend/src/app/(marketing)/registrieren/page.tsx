import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Kostenlos registrieren" };

export default function Registrieren() {
  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <h1 className="text-3xl font-semibold">Kostenlos testen</h1>
      <p className="mt-2 text-ink-2">14 Tage, ohne Zahlungsdaten. Die Testphase endet automatisch.</p>
      <Suspense><RegisterForm /></Suspense>
    </div>
  );
}
