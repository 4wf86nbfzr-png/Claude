/**
 * Ereignisse Richtung Oberfläche.
 *
 * Der Main-Prozess kennt das Fenster nicht direkt — er schiebt Ereignisse
 * hier hinein, und `index.ts` hängt einen Zusteller ein. Das hält Agenten
 * und Dienste frei von Electron.
 */
import type { JarvisEvent, JarvisState } from '@shared/types'

type Listener = (event: JarvisEvent) => void

const listeners = new Set<Listener>()
let currentState: JarvisState = 'IDLE'

export function onJarvisEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emit(event: JarvisEvent): void {
  if (event.type === 'state') currentState = event.state
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (err) {
      // Ein kaputter Zuhörer darf den Rest nicht aufhalten.
      console.error('[events] Zuhörer hat geworfen:', err)
    }
  }
}

export function setState(state: JarvisState, note?: string): void {
  emit({ type: 'state', state, note })
}

export function getState(): JarvisState {
  return currentState
}

export function status(message: string): void {
  emit({ type: 'status', message })
}

export function dataChanged(what: 'companies' | 'emails' | 'campaigns' | 'memory' | 'tasks'): void {
  emit({ type: 'data-changed', what })
}
