// Die Web-App erkennt daran, dass sie im Desktop-Rahmen läuft (z. B. für Links auf die Website).
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("clairifyDesktop", { version: process.versions.electron ? "1" : "0", platform: process.platform });
