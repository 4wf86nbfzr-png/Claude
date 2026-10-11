import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closeDb, withSystem } from "../../src/server/db/client";
import { login, signupTenant, requestPasswordReset, completePasswordReset, createInvitation, acceptInvitation, changePassword } from "../../src/server/auth/service";
import { findSession, buildContextFromSession, revokeSession } from "../../src/server/auth/session";
import { sentMailLog } from "../../src/server/modules/mail/mailer";
import { resetRateLimits } from "../../src/server/core/rate-limit";
import { makeTenant } from "../helpers";
import { users } from "../../src/server/db/schema";
import { eq } from "drizzle-orm";

beforeAll(() => resetRateLimits());
afterAll(() => closeDb());

describe("Registrierung und Login", () => {
  it("legt Mandant + Admin an und meldet an", async () => {
    const r = await signupTenant({ companyName: "Nordlicht Security", name: "Nina Test", email: "nina@test.invalid", password: "SehrSicher-2026!" });
    expect(r.tenant.slug).toBe("nordlicht-security");
    const s = await findSession(r.session.token);
    expect(s?.userId).toBe(r.user.id);
    const ctx = await buildContextFromSession(s!);
    expect(ctx?.role).toBe("tenant_admin");
    expect(ctx?.permissions.has("employees:write")).toBe(true);
  });

  it("verweigert falsche Passwörter mit generischer Meldung und sperrt nach 8 Versuchen", async () => {
    const f = await makeTenant();
    resetRateLimits();
    for (let i = 0; i < 8; i++) {
      resetRateLimits();
      await expect(login({ email: f.email, password: "falsch-falsch-falsch" })).rejects.toThrow("E-Mail-Adresse oder Passwort ist falsch.");
    }
    resetRateLimits();
    await expect(login({ email: f.email, password: f.password })).rejects.toThrow(/gesperrt/);
    // Sperre aufheben
    await withSystem((tx) => tx.update(users).set({ lockedUntil: null }).where(eq(users.id, f.userId)));
    resetRateLimits();
    const ok = await login({ email: f.email, password: f.password });
    expect(ok.user.id).toBe(f.userId);
  });

  it("unbekannte E-Mail liefert dieselbe Meldung wie falsches Passwort", async () => {
    resetRateLimits();
    await expect(login({ email: "niemand@test.invalid", password: "irgendwas-langes" })).rejects.toThrow("E-Mail-Adresse oder Passwort ist falsch.");
  });

  it("Rate-Limit greift bei Login-Flut", async () => {
    resetRateLimits();
    const f = await makeTenant();
    let limited = false;
    for (let i = 0; i < 30; i++) {
      try {
        await login({ email: f.email, password: "x".repeat(12) }, { ip: "203.0.113.9" });
      } catch (e) {
        if ((e as Error).message.includes("Zu viele")) {
          limited = true;
          break;
        }
      }
    }
    expect(limited).toBe(true);
    resetRateLimits();
  });

  it("widerrufene Sitzungen sind ungültig", async () => {
    const f = await makeTenant();
    resetRateLimits();
    const r = await login({ email: f.email, password: f.password });
    const s = await findSession(r.session.token);
    expect(s).not.toBeNull();
    await revokeSession(s!.sessionId);
    expect(await findSession(r.session.token)).toBeNull();
  });
});

describe("Passwort-Reset", () => {
  it("setzt über Token ein neues Passwort und invalidiert alte Sitzungen", async () => {
    const f = await makeTenant();
    resetRateLimits();
    const old = await login({ email: f.email, password: f.password });
    sentMailLog.length = 0;
    await requestPasswordReset(f.email);
    const mail = sentMailLog.find((m) => m.to === f.email);
    expect(mail).toBeDefined();
    const token = mail!.text.match(/passwort-zuruecksetzen\/([A-Za-z0-9_-]+)/)![1]!;
    await completePasswordReset(token, "Neues-Passwort-2026");
    expect(await findSession(old.session.token)).toBeNull();
    resetRateLimits();
    await expect(login({ email: f.email, password: f.password })).rejects.toThrow();
    resetRateLimits();
    const fresh = await login({ email: f.email, password: "Neues-Passwort-2026" });
    expect(fresh.user.id).toBe(f.userId);
    // Token nur einmal verwendbar
    await expect(completePasswordReset(token, "Noch-ein-Passwort-1")).rejects.toThrow(/ungültig/);
  });

  it("verrät bei unbekannter Adresse nichts und versendet nichts", async () => {
    sentMailLog.length = 0;
    resetRateLimits();
    await requestPasswordReset("unbekannt@test.invalid");
    expect(sentMailLog.length).toBe(0);
  });

  it("Passwortwechsel hält die aktuelle Sitzung, beendet andere", async () => {
    const f = await makeTenant();
    resetRateLimits();
    const a = await login({ email: f.email, password: f.password });
    resetRateLimits();
    const b = await login({ email: f.email, password: f.password });
    const sa = await findSession(a.session.token);
    await changePassword(f.userId, f.password, "Wieder-Neu-2026-x", sa!.sessionId);
    expect(await findSession(a.session.token)).not.toBeNull();
    expect(await findSession(b.session.token)).toBeNull();
  });
});

describe("Einladungen", () => {
  it("lädt Disponenten ein; Annahme erzeugt Konto und Mitgliedschaft", async () => {
    const f = await makeTenant();
    const inv = await createInvitation(f.tenantId, f.userId, { email: "dispo@test.invalid", role: "dispatcher" });
    const token = inv.link.split("/einladung/")[1]!;
    const acc = await acceptInvitation(token, { name: "Dirk Dispo", password: "Dispo-Passwort-2026" });
    const s = await findSession(acc.session.token);
    const ctx = await buildContextFromSession(s!);
    expect(ctx?.tenantId).toBe(f.tenantId);
    expect(ctx?.role).toBe("dispatcher");
    expect(ctx?.permissions.has("settings:write")).toBe(false);
    expect(ctx?.permissions.has("shifts:assign")).toBe(true);
    // Zweite Annahme schlägt fehl
    await expect(acceptInvitation(token, { name: "Xaver Zwei", password: "Dispo-Passwort-2026" })).rejects.toThrow(/ungültig/);
  });

  it("Mitarbeiterrolle ohne Mitarbeiterdatensatz wird abgelehnt", async () => {
    const f = await makeTenant();
    await expect(createInvitation(f.tenantId, f.userId, { email: "ma@test.invalid", role: "employee" })).rejects.toThrow(/Mitarbeiterdatensatz/);
  });
});
