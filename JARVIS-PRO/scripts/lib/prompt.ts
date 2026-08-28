/**
 * Eingabe von der Konsole.
 *
 * Zwei Betriebsarten, weil readline mit durchgeleiteter Eingabe nicht
 * zuverlaessig arbeitet: sobald das Ende der Pipe erreicht ist, schliesst
 * sich readline, und die naechste Frage schlaegt fehl. Ein Skript sieht dann
 * aus, als haette der Benutzer sofort abgebrochen.
 *
 * Deshalb: am Terminal wird gefragt, bei einer Pipe wird die Eingabe vorab
 * vollstaendig gelesen und Zeile fuer Zeile beantwortet. Das macht die
 * Einrichtungsskripte automatisierbar, ohne dass sie interaktiv schlechter
 * werden.
 */
import { createInterface, type Interface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export interface Prompt {
  frage(text: string, vorgabe?: string): Promise<string>;
  close(): void;
  readonly interaktiv: boolean;
}

export async function createPrompt(): Promise<Prompt> {
  const interaktiv = stdin.isTTY === true;

  if (interaktiv) {
    const rl: Interface = createInterface({ input: stdin, output: stdout });
    return {
      interaktiv,
      frage: async (text, vorgabe = '') => {
        const antwort = (await rl.question(`${text}${vorgabe.length > 0 ? ` [${vorgabe}]` : ''}: `)).trim();
        return antwort.length > 0 ? antwort : vorgabe;
      },
      close: () => rl.close(),
    };
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  const zeilen = Buffer.concat(chunks).toString('utf8').split('\n');
  let index = 0;

  return {
    interaktiv,
    frage: async (text, vorgabe = '') => {
      const roh = (zeilen[index] ?? '').trim();
      index += 1;
      const antwort = roh.length > 0 ? roh : vorgabe;
      stdout.write(`${text}${vorgabe.length > 0 ? ` [${vorgabe}]` : ''}: ${antwort}\n`);
      return antwort;
    },
    close: () => undefined,
  };
}
