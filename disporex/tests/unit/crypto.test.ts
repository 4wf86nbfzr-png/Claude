import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, encryptSecret, decryptSecret, hmacSha256, sha256 } from "../../src/server/core/crypto";
import { resolvePermissions } from "../../src/server/auth/permissions";
import { checkRateLimit, resetRateLimits } from "../../src/server/core/rate-limit";

describe("Passwort-Hashing", () => {
  it("verifiziert korrekt und lehnt falsche Passwörter ab", async () => {
    const h = await hashPassword("Geheim-2026!");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Geheim-2026!", h)).toBe(true);
    expect(await verifyPassword("geheim-2026!", h)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });
});

describe("Verschlüsselung", () => {
  it("ver- und entschlüsselt", () => {
    const c = encryptSecret("whsec_abc");
    expect(c).not.toContain("whsec_abc");
    expect(decryptSecret(c)).toBe("whsec_abc");
  });
  it("HMAC ist deterministisch", () => {
    expect(hmacSha256("k", "payload")).toBe(hmacSha256("k", "payload"));
    expect(sha256("a")).toHaveLength(64);
  });
});

describe("Berechtigungen", () => {
  it("Overrides schalten Rechte zu und ab", () => {
    const p = resolvePermissions("dispatcher", [
      { permission: "settings:write", allowed: true },
      { permission: "shifts:assign", allowed: false },
      { permission: "unbekannt:x", allowed: true },
    ]);
    expect(p.has("settings:write")).toBe(true);
    expect(p.has("shifts:assign")).toBe(false);
    expect(p.has("unbekannt:x" as never)).toBe(false);
  });
  it("Buchhaltung sieht keine vertraulichen Personalunterlagen", () => {
    const p = resolvePermissions("accounting");
    expect(p.has("billing:read")).toBe(true);
    expect(p.has("employees:documents")).toBe(false);
    expect(p.has("documents:confidential")).toBe(false);
  });
});

describe("Rate-Limit", () => {
  it("blockt nach Limit und gibt Retry-After", () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) expect(checkRateLimit("k", 3).allowed).toBe(true);
    const r = checkRateLimit("k", 3);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });
});
