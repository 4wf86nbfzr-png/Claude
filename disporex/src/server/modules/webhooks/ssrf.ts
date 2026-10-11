import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ValidationError } from "../../core/errors";

/** Private, loopback, link-local und sonstige ungeeignete Adressbereiche. */
function isForbiddenIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast/reserved
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd")) return true;
  if (v6.startsWith("::ffff:")) return isForbiddenIp(v6.slice(7));
  return false;
}

/**
 * Prüft eine Webhook-URL: nur http(s), kein Zugangsdaten-Teil, kein interner Host.
 * Löst den Hostnamen auf und verweigert private Zieladressen (SSRF-Schutz).
 * Gibt die geprüfte IP zurück, damit der Aufruf sie verwenden kann (gegen DNS-Rebinding).
 */
export async function validateWebhookUrl(raw: string, opts: { requireHttps: boolean }): Promise<{ url: URL; ip: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError("Ungültige URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ValidationError("Nur http(s)-URLs sind erlaubt.");
  if (opts.requireHttps && url.protocol !== "https:") throw new ValidationError("In Produktion sind nur https-URLs erlaubt.");
  if (url.username || url.password) throw new ValidationError("URL darf keine Zugangsdaten enthalten.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new ValidationError("Interne Hostnamen sind nicht erlaubt.");
  let ip = host;
  if (!isIP(host)) {
    try {
      const r = await lookup(host);
      ip = r.address;
    } catch {
      throw new ValidationError(`Hostname ${host} konnte nicht aufgelöst werden.`);
    }
  }
  if (isForbiddenIp(ip)) throw new ValidationError("Ziel liegt in einem internen oder reservierten Adressbereich.");
  return { url, ip };
}

export { isForbiddenIp };
