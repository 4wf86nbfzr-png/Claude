// Clairify Desktop: ein schlanker Rahmen um die Web-App. Die Anmeldung ist das vorhandene Anmeldeformular der App;
// wer noch kein Konto hat, wird auf die Website zur Tarifwahl geführt (öffnet im Systembrowser).
"use strict";
const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const path = require("path");

// Adresse der App: Umgebungsvariable CLAIRIFY_APP_URL oder der Standard (Live-Adresse eintragen, sobald sie steht).
const APP_URL = (process.env.CLAIRIFY_APP_URL || "https://app.clairify.de").replace(/\/$/, "");
const START = APP_URL + "/anmelden?app=desktop";
// Seiten der Website (Marketing), die nicht im App-Fenster, sondern im Browser geöffnet werden
const WEBSITE_PATHS = /^\/(preise|registrieren|funktionen|branchen|demo|hilfe|kontakt|ratgeber|impressum|datenschutz|agb|widerruf)?(\/|$|\?)/;

let win = null;

function isWebsiteUrl(url) {
  try { const u = new URL(url); return u.origin !== APP_URL ? true : WEBSITE_PATHS.test(u.pathname) && !u.pathname.startsWith("/app") && !u.pathname.startsWith("/anmelden") && !u.pathname.startsWith("/passwort") && !u.pathname.startsWith("/bestaetigen") && !u.pathname.startsWith("/einladung") && !u.pathname.startsWith("/termin"); } catch (e) { return true; }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600, show: false, title: "Clairify",
    backgroundColor: "#f6f5f2", icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true }
  });
  win.once("ready-to-show", () => win.show());
  // Links auf die Website und fremde Adressen im Systembrowser öffnen; die App bleibt bei sich
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (isWebsiteUrl(url)) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on("did-fail-load", (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: abgebrochen (z. B. Weiterleitung), kein Fehler
    win.loadFile(path.join(__dirname, "offline.html"), { query: { url: START, fehler: desc || String(code) } });
  });
  win.loadURL(START);
  win.on("closed", () => { win = null; });
}

const menu = Menu.buildFromTemplate([
  ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
  { label: "Datei", submenu: [{ label: "Neu laden", accelerator: "CmdOrCtrl+R", click: () => win && win.loadURL(START) }, { type: "separator" }, { role: "quit", label: "Beenden" }] },
  { label: "Bearbeiten", submenu: [{ role: "undo", label: "Rückgängig" }, { role: "redo", label: "Wiederholen" }, { type: "separator" }, { role: "cut", label: "Ausschneiden" }, { role: "copy", label: "Kopieren" }, { role: "paste", label: "Einfügen" }, { role: "selectAll", label: "Alles auswählen" }] },
  { label: "Ansicht", submenu: [{ role: "zoomIn", label: "Vergrößern" }, { role: "zoomOut", label: "Verkleinern" }, { role: "resetZoom", label: "Normalgröße" }, { type: "separator" }, { role: "togglefullscreen", label: "Vollbild" }] },
  { label: "Hilfe", submenu: [{ label: "Hilfezentrum (Website)", click: () => shell.openExternal(APP_URL + "/hilfe") }, { label: "Tarif wählen (Website)", click: () => shell.openExternal(APP_URL + "/preise") }, { label: "Über Clairify", click: () => dialog.showMessageBox({ type: "info", title: "Clairify", message: "Clairify Desktop " + app.getVersion(), detail: "Verbunden mit " + APP_URL }) }] }
]);

app.whenReady().then(() => { Menu.setApplicationMenu(menu); createWindow(); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
// Nur eine Instanz
if (!app.requestSingleInstanceLock()) app.quit(); else app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
