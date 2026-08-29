/**
 * `pnpm tsx scripts/hash-pin.ts` - erzeugt den Hash einer PIN.
 *
 * Die PIN wird verdeckt eingelesen, nie ausgegeben, nie in die
 * Shell-Historie geschrieben und nie als Argument uebergeben. Herauskommt
 * nur der scrypt-Hash, der in den Schluesselbund gehoert.
 */
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { hashPin, verifyPin } from '@jarvis/security';

async function askHidden(frage: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const anyRl = rl as unknown as { _writeToOutput?: (s: string) => void; output?: NodeJS.WriteStream };
    let first = true;
    anyRl._writeToOutput = (s: string): void => {
      if (first) {
        anyRl.output?.write(s);
        first = false;
        return;
      }
      // Nur die Zeilenumbrueche durchlassen - die Ziffern bleiben unsichtbar.
      if (s.includes('\n')) anyRl.output?.write('\n');
    };
    rl.question(frage, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  console.log('\nPIN-Hash erzeugen');
  console.log('-----------------');
  console.log('Die Eingabe bleibt unsichtbar. Der Klartext wird nirgends gespeichert.\n');

  const pin = await askHidden('PIN (nur Ziffern, mindestens 4): ');
  if (!/^\d{4,12}$/.test(pin)) {
    console.error('\nDie PIN muss aus 4 bis 12 Ziffern bestehen. Es wurde nichts erzeugt.');
    process.exitCode = 1;
    return;
  }
  const wiederholung = await askHidden('PIN wiederholen:               ');
  if (pin !== wiederholung) {
    console.error('\nDie Eingaben stimmen nicht ueberein. Es wurde nichts erzeugt.');
    process.exitCode = 1;
    return;
  }

  const hash = await hashPin(pin);
  const geprueft = await verifyPin(pin, hash);
  if (!geprueft) {
    console.error('\nDer erzeugte Hash liess sich nicht gegenpruefen. Bitte melden.');
    process.exitCode = 1;
    return;
  }

  console.log('\nHash erzeugt und gegengeprueft.\n');
  console.log(hash);
  console.log('\nSo hinterlegst du ihn (der Hash ist kein Geheimnis, aber die PIN bleibt es):');
  if (process.platform === 'darwin') {
    console.log('  security add-generic-password -U -s de.hermservice.jarvis-pro \\');
    console.log('    -a approval-pin-hash -w "<hash oben>"');
  } else {
    console.log('  secret-tool store --label "jarvis approval-pin-hash" \\');
    console.log('    service de.hermservice.jarvis-pro account approval-pin-hash');
  }
  console.log('\nFuer die Anmelde-PIN dasselbe mit "login-pin-hash".');
  console.log('Wichtig: Anmelde-PIN und Freigabe-PIN muessen unterschiedlich sein.\n');
}

void main();
