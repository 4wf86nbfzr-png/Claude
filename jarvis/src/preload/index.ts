import { contextBridge, ipcRenderer } from 'electron';
import { KANAL, type JarvisApi } from '../shared/ipc';
import type { AgentEvent } from '../shared/types';

/**
 * Die einzige Brücke zwischen Fenster und Kern.
 *
 * Der Renderer bekommt keine Node-Module und kein `ipcRenderer`, sondern
 * ausschließlich die hier aufgeführten Funktionen. Was nicht in dieser Datei
 * steht, ist aus der Oberfläche schlicht nicht erreichbar.
 */
const api: JarvisApi = {
  senden: (text) => ipcRenderer.invoke(KANAL.senden, text),
  verlauf: () => ipcRenderer.invoke(KANAL.verlauf),
  status: () => ipcRenderer.invoke(KANAL.status),
  vorlesetext: (emailId) => ipcRenderer.invoke(KANAL.vorlesetext, emailId),

  offeneFreigaben: () => ipcRenderer.invoke(KANAL.freigabenOffen),
  entscheiden: (approvalId, freigegeben, notiz) =>
    ipcRenderer.invoke(KANAL.freigabeEntscheiden, approvalId, freigegeben, notiz),
  freigabenVerlauf: (limit) => ipcRenderer.invoke(KANAL.freigabenVerlauf, limit),

  versandzentrale: (filter) => ipcRenderer.invoke(KANAL.versandzentrale, filter),
  kampagnen: () => ipcRenderer.invoke(KANAL.kampagnen),
  unternehmen: (suche) => ipcRenderer.invoke(KANAL.unternehmen, suche),

  entwuerfe: (status) => ipcRenderer.invoke(KANAL.entwuerfe, status),
  entwurfLesen: (emailId) => ipcRenderer.invoke(KANAL.entwurfLesen, emailId),
  entwurfAendern: (emailId, patch) => ipcRenderer.invoke(KANAL.entwurfAendern, emailId, patch),
  freigabeAnfordern: (emailId) => ipcRenderer.invoke(KANAL.freigabeAnfordern, emailId),

  protokoll: (limit) => ipcRenderer.invoke(KANAL.protokoll, limit),
  gedaechtnis: () => ipcRenderer.invoke(KANAL.gedaechtnis),
  gedaechtnisLoeschen: (id) => ipcRenderer.invoke(KANAL.gedaechtnisLoeschen, id),
  verlaufLoeschen: () => ipcRenderer.invoke(KANAL.verlaufLoeschen),

  sperrliste: () => ipcRenderer.invoke(KANAL.sperrliste),
  sperrlisteHinzu: (wert, art, grund) => ipcRenderer.invoke(KANAL.sperrlisteHinzu, wert, art, grund),
  sperrlisteEntfernen: (id) => ipcRenderer.invoke(KANAL.sperrlisteEntfernen, id),

  zugangsdaten: () => ipcRenderer.invoke(KANAL.zugangsdaten),
  zugangsdatenSetzen: (name, wert) => ipcRenderer.invoke(KANAL.zugangsdatenSetzen, name, wert),
  zugangsdatenEntfernen: (name) => ipcRenderer.invoke(KANAL.zugangsdatenEntfernen, name),
  googleVerbinden: () => ipcRenderer.invoke(KANAL.googleVerbinden),

  transkribieren: (audio, mimeType) => ipcRenderer.invoke(KANAL.transkribieren, audio, mimeType),
  sprechen: (text) => ipcRenderer.invoke(KANAL.sprechen, text),

  aufEreignis: (listener: (event: AgentEvent) => void) => {
    const wrapper = (_event: unknown, nutzlast: AgentEvent) => listener(nutzlast);
    ipcRenderer.on(KANAL.ereignis, wrapper);
    return () => ipcRenderer.removeListener(KANAL.ereignis, wrapper);
  }
};

contextBridge.exposeInMainWorld('jarvis', api);
