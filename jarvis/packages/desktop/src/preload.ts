import { contextBridge, ipcRenderer } from 'electron';
import { IPC_COMMAND_CHANNEL, IPC_EVENT_CHANNEL, type Command, type CommandResponse, type IpcEventEnvelope } from '@jarvis/core/ipc';

/**
 * Die einzige Bruecke zwischen Fenster und Betriebssystem.
 *
 * Es wird nichts von Node durchgereicht -- nur zwei Funktionen: einen Befehl
 * schicken und Ereignisse empfangen. Selbst wenn im Fenster fremder Code
 * liefe, kaeme er darueber nicht an Dateien oder Prozesse.
 */
const bridge = {
  invoke: (command: Command): Promise<CommandResponse> =>
    ipcRenderer.invoke(IPC_COMMAND_CHANNEL, command) as Promise<CommandResponse>,

  onEvent: (handler: (event: IpcEventEnvelope) => void): (() => void) => {
    const listener = (_e: unknown, payload: IpcEventEnvelope) => handler(payload);
    ipcRenderer.on(IPC_EVENT_CHANNEL, listener);
    return () => ipcRenderer.off(IPC_EVENT_CHANNEL, listener);
  },

  plattform: process.platform,
  version: process.versions.electron ?? 'unbekannt',
};

contextBridge.exposeInMainWorld('jarvis', bridge);

export type JarvisPreloadBridge = typeof bridge;
