import type { Metadata } from "next";
import { HelpList } from "./help-list";

export const metadata: Metadata = { title: "Hilfezentrum", description: "Anleitungen zu Einrichtung, Anfragen, Entwürfen, Terminen, Angeboten, Abrechnung und Datenschutz." };

export default function Hilfe() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold md:text-4xl">Hilfezentrum</h1>
      <p className="mt-3 text-ink-2">Kurz und konkret. Wenn etwas fehlt, schreiben Sie uns über <a className="text-accent underline" href="/kontakt">Kontakt</a> oder als Kunde direkt im Dashboard unter Support.</p>
      <HelpList />
      <section className="prose mt-12">
        <h2>Noch nicht verfügbar</h2>
        <ul><li>Anbindung von WhatsApp (rechtliche und technische Prüfung offen)</li><li>Telefonannahme / Transkription vom Anrufbeantworter</li><li>Microsoft 365 Kalender</li><li>Rechnungsstellung an Ihre Endkunden</li></ul>
        <p>Wir versprechen keine Termine für diese Punkte. Wenn eine Funktion fertig ist, steht sie hier.</p>
      </section>
    </div>
  );
}
