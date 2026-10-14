import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Kostenlos registrieren" };

export default function Registrieren() {
  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <h1 className="text-3xl font-semibold">Kostenlos testen</h1>
      <p className="mt-2 text-ink-2">14 Tage, ohne Zahlungsdaten. Die Testphase endet automatisch.</p>
      {/* Platzhalter in Formularhöhe (sieben Felder, Hinweis, Knopf), damit die Fußzeile beim Hydrieren nicht springt */}
      <Suspense fallback={<div className="mt-8 min-h-[43rem]" aria-hidden />}><RegisterForm /></Suspense>
    </div>
  );
}
