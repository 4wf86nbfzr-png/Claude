import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default function Anmelden() {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-semibold">Anmelden</h1>
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
