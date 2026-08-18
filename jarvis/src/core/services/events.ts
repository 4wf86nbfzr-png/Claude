import type { AgentEvent } from '../../shared/types';

export type EventListener = (event: AgentEvent) => void;

/**
 * Sehr kleiner Ereignisverteiler zwischen Agenten, Diensten und Oberfläche.
 * Bewusst ohne Abhängigkeit – es geht nur um "sag der Oberfläche Bescheid".
 */
export class EventBus {
  private readonly listeners = new Set<EventListener>();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ein defekter Empfänger darf den Ablauf nicht anhalten.
      }
    }
  }
}
