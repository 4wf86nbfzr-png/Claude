# Clairify Desktop

Schlanker Rahmen (Electron) um die Web-App für Windows, macOS und Linux. Die App zeigt das vorhandene
Anmeldeformular; wer noch kein Konto hat, kommt über „Noch kein Konto?“ auf die Website zur Tarifwahl
(öffnet im Systembrowser). Links auf Website-Seiten verlassen das App-Fenster immer.

- Adresse der App: `CLAIRIFY_APP_URL` beim Start, Standard `https://app.clairify.de` (in `main.js` anpassen, sobald die Live-Adresse steht).
- Entwicklung: `npm install`, `CLAIRIFY_APP_URL=http://localhost:3000 npm start`
- Installationsdateien: `npm run dist:linux` (AppImage, deb), `npm run dist:win` (NSIS-Installer), `npm run dist:mac` (dmg, zip; nur auf macOS, Signierung mit Apple-Developer-Zertifikat).
- Veröffentlichung: Tag `desktop-v1.0.0` pushen, der Workflow `.github/workflows/desktop.yml` baut auf allen drei
  Systemen und hängt die Dateien an ein GitHub-Release. Die Website zeigt die Downloads, sobald die Adressen in
  `DOWNLOAD_*_URL` (Backend) gesetzt sind, z. B. `https://github.com/<owner>/<repo>/releases/latest/download/Clairify-1.0.0-win-x64.exe`.
- Ohne Signatur warnen Windows (SmartScreen) und macOS (Gatekeeper) beim ersten Start. Für den Vertrieb braucht es
  ein Code-Signing-Zertifikat (Windows) und ein Apple-Developer-Konto (macOS, Notarisierung).
