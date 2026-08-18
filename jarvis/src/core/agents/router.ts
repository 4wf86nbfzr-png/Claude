import type { LlmProvider } from '../services/llm';
import { foldUmlauts } from '../util/text';
import { AGENTEN, agentByName, type AgentDefinition } from './definitions';

export interface Routing {
  agent: AgentDefinition;
  quelle: 'stichwort' | 'modell' | 'standard';
}

/**
 * Schnelle Zuordnung über Stichwörter.
 * Deckt die häufigen Fälle ab, ohne dafür ein Modell zu bemühen.
 */
export function schnellRouting(text: string): AgentDefinition | null {
  const wert = foldUmlauts(text.toLowerCase());
  let bester: { agent: AgentDefinition; punkte: number } | null = null;
  for (const agent of AGENTEN) {
    let punkte = 0;
    for (const stichwort of agent.stichwoerter) {
      if (wert.includes(foldUmlauts(stichwort))) punkte += stichwort.length;
    }
    if (punkte > 0 && (!bester || punkte > bester.punkte)) bester = { agent, punkte };
  }
  return bester?.agent ?? null;
}

/**
 * Bestimmt den zuständigen Agenten (§9).
 * Erst Stichwörter, dann – falls unklar und ein Modell verfügbar ist – eine
 * kurze Rückfrage an das Modell. Im Zweifel übernimmt JarvisCore selbst.
 */
export async function bestimmeAgent(text: string, llm: LlmProvider): Promise<Routing> {
  const ueberStichwort = schnellRouting(text);
  if (ueberStichwort) return { agent: ueberStichwort, quelle: 'stichwort' };

  const standard = agentByName('JarvisCore')!;
  if (!llm.configured()) return { agent: standard, quelle: 'standard' };

  try {
    const antwort = await llm.complete({
      system:
        'Du ordnest eine Benutzeräußerung genau einem Agenten zu. Antworte ausschließlich mit dem Namen des Agenten.\n\n' +
        AGENTEN.map((agent) => `${agent.name}: ${agent.zustaendigFuer}`).join('\n'),
      messages: [{ role: 'user', content: text }],
      maxTokens: 20,
      temperature: 0
    });
    const treffer = agentByName(antwort.text.replace(/[^A-Za-z]/g, ''));
    return treffer ? { agent: treffer, quelle: 'modell' } : { agent: standard, quelle: 'standard' };
  } catch {
    // Modell nicht erreichbar – dann übernimmt der Kern und meldet den Fehler dort.
    return { agent: standard, quelle: 'standard' };
  }
}
