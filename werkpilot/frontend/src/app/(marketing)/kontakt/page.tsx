import type { Metadata } from "next";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Kontakt", description: "Fragen zu Clairify? Rückruf oder Demo anfragen." };

export default function Kontakt() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold md:text-4xl">Kontakt</h1>
      <p className="mt-3 text-ink-2">Wir antworten per Mail, in der Regel am nächsten Werktag. Keine Verkaufsanrufe, keine Newsletter ohne Ihre Zustimmung.</p>
      <ContactForm />
    </div>
  );
}
