/**
 * Ersatz fuer das Paket "server-only" in den Kommandozeilen-Skripten.
 *
 * "server-only" ist eine Schutzmassnahme von Next.js: Es wirft, sobald ein
 * Modul versehentlich in eine Client-Komponente gerät. In einem reinen
 * Node-Prozess (Cron-Jobs) gibt es keine Client-Komponenten – dort ist die
 * Sperre nur im Weg. Die Zuordnung erfolgt ausschliesslich ueber
 * scripts/tsconfig.json und wirkt damit nie auf die Anwendung selbst.
 */
export {};
