/**
 * Hört JARVIS gerade sich selbst zu?
 *
 * Mit der Web-Speech-Erkennung stellte sich die Frage nicht — die lief nur,
 * während der Mensch sprach. Die lokale Erkennung nimmt dagegen alles auf, was
 * ins Mikrofon kommt, und das schließt den eigenen Lautsprecher ein. Die
 * Echounterdrückung des Systems fängt das meiste ab, aber nicht alles: bei
 * aufgedrehten Boxen kommt JARVIS' letzter Satz zurück, wird transkribiert und
 * als neue Anweisung behandelt. Zwei Runden später unterhält er sich mit sich
 * selbst.
 *
 * Deshalb der Abgleich: Was hereinkommt, wird mit dem verglichen, was gerade
 * gesagt wurde. Verglichen werden Wortmengen und nicht ganze Zeichenketten,
 * weil die Erkennung nie wortgleich zurückliefert, was die Stimme gesagt hat.
 */
export function istEigenerNachhall(gesagt: string, gehoert: string): boolean {
  const eigen = woerter(gesagt);
  const fremd = woerter(gehoert);
  // Sehr kurze Einwürfe sind Antworten des Menschen ("ja", "nein", "stopp"),
  // keine Echos -- die dürfen nie verschluckt werden.
  if (fremd.length === 0 || fremd.length < 3) return false;
  if (eigen.length === 0) return false;

  const treffer = fremd.filter((w) => eigen.includes(w)).length;
  return treffer / fremd.length >= 0.7;
}

function woerter(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}
