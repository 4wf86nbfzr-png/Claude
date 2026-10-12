import { Suspense } from "react";
import { ConfirmAppointment } from "./confirm";

export const metadata = { title: "Termin bestätigen", robots: { index: false } };

export default function Termin() {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-semibold">Termin bestätigen</h1>
      <Suspense><ConfirmAppointment /></Suspense>
    </div>
  );
}
