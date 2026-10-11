import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { withSystem, withTenant } from "../db/client";
import { users, tenants, memberships, invitations, passwordResets, sessions, auditLogs, type RoleKey } from "../db/schema";
import { hashPassword, verifyPassword, randomToken, sha256 } from "../core/crypto";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "../core/errors";
import { createSession, revokeAllSessions } from "./session";
import { sendMail } from "../modules/mail/mailer";
import { env } from "../core/env";
import { z } from "zod";
import { logger } from "../core/logger";
import { enforceRateLimit } from "../core/rate-limit";

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export const passwordSchema = z
  .string()
  .min(10, "Mindestens 10 Zeichen")
  .max(200)
  .refine((p) => !/^(.)\1+$/.test(p), "Zu einfach");

export const emailSchema = z.string().trim().toLowerCase().email("Ungültige E-Mail-Adresse").max(254);

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export const signupSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
});

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "firma"
  );
}

async function securityLog(action: string, data: { userId?: string | null; tenantId?: string | null; ip?: string; detail?: unknown }) {
  await withSystem((tx) =>
    tx.insert(auditLogs).values({
      tenantId: data.tenantId ?? null,
      actorUserId: data.userId ?? null,
      action,
      entityType: "auth",
      entityId: data.userId ?? null,
      after: data.detail ? (data.detail as object) : null,
      ip: data.ip ?? null,
    }),
  );
}

// ---------------------------------------------------------------------------
// Registrierung eines neuen Mandanten (Self-Service-Onboarding / Erststart)
// ---------------------------------------------------------------------------
export async function signupTenant(input: z.infer<typeof signupSchema>, meta: { ip?: string; userAgent?: string } = {}) {
  const data = signupSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  const result = await withSystem(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${data.email}`)
      .limit(1);
    if (existing[0]) throw new ConflictError("Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte anmelden.");

    const base = slugify(data.companyName);
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const taken = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (!taken[0]) break;
      slug = `${base}-${i}`;
    }
    const isFirstUser = ((await tx.select({ c: sql<number>`count(*)::int` }).from(users))[0]?.c ?? 0) === 0;

    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: data.companyName,
        slug,
        settings: { timezone: "Europe/Berlin", responseDeadlineHours: 24, minRestHours: 11, maxShiftHours: 12, reconciliationToleranceMinutes: 5 },
      })
      .returning();
    const [user] = await tx
      .insert(users)
      .values({ email: data.email, name: data.name, passwordHash, isSystemAdmin: isFirstUser, status: "active" })
      .returning();
    if (!tenant || !user) throw new Error("Anlage fehlgeschlagen");
    await tx.insert(memberships).values({ tenantId: tenant.id, userId: user.id, role: "tenant_admin" });
    return { tenant, user };
  });
  await securityLog("auth.signup", { userId: result.user.id, tenantId: result.tenant.id, ip: meta.ip });
  const session = await createSession({ userId: result.user.id, tenantId: result.tenant.id, ip: meta.ip, userAgent: meta.userAgent, reauth: true });
  return { ...result, session };
}

// ---------------------------------------------------------------------------
// Login mit Sperre nach Fehlversuchen
// ---------------------------------------------------------------------------
export async function login(input: z.infer<typeof loginSchema>, meta: { ip?: string; userAgent?: string } = {}) {
  const data = loginSchema.parse(input);
  enforceRateLimit(`login:${meta.ip ?? "?"}`, env().RATE_LIMIT_AUTH_PER_MINUTE);
  enforceRateLimit(`login:email:${data.email}`, env().RATE_LIMIT_AUTH_PER_MINUTE * 2);

  const user = (
    await withSystem((tx) =>
      tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${data.email}`)
        .limit(1),
    )
  )[0];

  const generic = new UnauthorizedError("E-Mail-Adresse oder Passwort ist falsch.");

  if (!user) {
    await verifyPassword(data.password, null);
    await securityLog("auth.login_failed", { ip: meta.ip, detail: { reason: "unknown_user" } });
    throw generic;
  }
  if (user.status === "disabled") {
    await securityLog("auth.login_failed", { userId: user.id, ip: meta.ip, detail: { reason: "disabled" } });
    throw new UnauthorizedError("Dieses Konto ist deaktiviert.");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await securityLog("auth.login_failed", { userId: user.id, ip: meta.ip, detail: { reason: "locked" } });
    throw new UnauthorizedError(`Konto vorübergehend gesperrt. Bitte in ${LOCK_MINUTES} Minuten erneut versuchen.`);
  }
  if (user.status === "invited" || !user.passwordHash) {
    await verifyPassword(data.password, null);
    throw new UnauthorizedError("Für dieses Konto wurde noch kein Passwort gesetzt. Bitte Einladung annehmen oder Passwort zurücksetzen.");
  }
  const ok = await verifyPassword(data.password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED;
    await withSystem((tx) =>
      tx
        .update(users)
        .set({ failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
        .where(eq(users.id, user.id)),
    );
    await securityLog("auth.login_failed", { userId: user.id, ip: meta.ip, detail: { reason: "bad_password", locked: lock } });
    throw generic;
  }
  await withSystem((tx) => tx.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id)));
  const session = await createSession({ userId: user.id, tenantId: null, ip: meta.ip, userAgent: meta.userAgent, reauth: true });
  await securityLog("auth.login", { userId: user.id, ip: meta.ip });
  return { user, session };
}

/** Passwort erneut bestätigen (für sensible Aktionen). */
export async function reauthenticate(userId: string, sessionId: string, password: string): Promise<boolean> {
  const user = (await withSystem((tx) => tx.select().from(users).where(eq(users.id, userId)).limit(1)))[0];
  if (!user) return false;
  const ok = await verifyPassword(password, user.passwordHash);
  if (ok) await withSystem((tx) => tx.update(sessions).set({ reauthAt: new Date() }).where(eq(sessions.id, sessionId)));
  return ok;
}

// ---------------------------------------------------------------------------
// Passwort ändern / zurücksetzen
// ---------------------------------------------------------------------------
export async function changePassword(userId: string, currentPassword: string, newPassword: string, keepSessionId?: string) {
  passwordSchema.parse(newPassword);
  const user = (await withSystem((tx) => tx.select().from(users).where(eq(users.id, userId)).limit(1)))[0];
  if (!user) throw new NotFoundError();
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new ValidationError("Das aktuelle Passwort ist falsch.");
  const passwordHash = await hashPassword(newPassword);
  await withSystem((tx) => tx.update(users).set({ passwordHash, sessionsInvalidBefore: new Date() }).where(eq(users.id, userId)));
  await revokeAllSessions(userId, keepSessionId);
  if (keepSessionId) {
    // Die aktuelle Sitzung bleibt gültig: Erstellungszeit auf jetzt setzen, damit sessionsInvalidBefore nicht greift.
    await withSystem((tx) => tx.update(sessions).set({ createdAt: new Date(Date.now() + 1000) }).where(eq(sessions.id, keepSessionId)));
  }
  await securityLog("auth.password_changed", { userId });
}

/** Immer gleiche Antwort – verrät nicht, ob die Adresse existiert. */
export async function requestPasswordReset(email: string, meta: { ip?: string } = {}): Promise<void> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return;
  enforceRateLimit(`pwreset:${meta.ip ?? "?"}`, env().RATE_LIMIT_AUTH_PER_MINUTE);
  const user = (
    await withSystem((tx) =>
      tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${parsed.data}`)
        .limit(1),
    )
  )[0];
  if (!user || user.status === "disabled") return;
  const token = randomToken(32);
  await withSystem((tx) =>
    tx.insert(passwordResets).values({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000), requestedIp: meta.ip ?? null }),
  );
  const link = `${env().APP_URL}/passwort-zuruecksetzen/${token}`;
  await sendMail({
    to: user.email,
    subject: "DispoRex – Passwort zurücksetzen",
    text: `Hallo ${user.name},\n\nüber diesen Link können Sie innerhalb von 60 Minuten ein neues Passwort setzen:\n${link}\n\nFalls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.`,
  });
  await securityLog("auth.password_reset_requested", { userId: user.id, ip: meta.ip });
}

export async function completePasswordReset(token: string, newPassword: string): Promise<void> {
  passwordSchema.parse(newPassword);
  const row = (
    await withSystem((tx) =>
      tx
        .select()
        .from(passwordResets)
        .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
        .limit(1),
    )
  )[0];
  if (!row) throw new ValidationError("Der Link ist ungültig oder abgelaufen.");
  const passwordHash = await hashPassword(newPassword);
  await withSystem(async (tx) => {
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
    await tx
      .update(users)
      .set({ passwordHash, status: "active", failedLoginCount: 0, lockedUntil: null, sessionsInvalidBefore: new Date() })
      .where(eq(users.id, row.userId));
  });
  await revokeAllSessions(row.userId);
  await securityLog("auth.password_reset_completed", { userId: row.userId });
}

// ---------------------------------------------------------------------------
// Einladungen
// ---------------------------------------------------------------------------
export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["tenant_admin", "dispatcher", "operations_lead", "hr", "accounting", "customer", "partner", "employee"]),
  employeeId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  partnerId: z.string().uuid().optional().nullable(),
});

export async function createInvitation(tenantId: string, invitedBy: string, input: z.infer<typeof inviteSchema>) {
  const data = inviteSchema.parse(input);
  if (data.role === "employee" && !data.employeeId) throw new ValidationError("Für die Rolle Mitarbeiter muss ein Mitarbeiterdatensatz gewählt werden.");
  if (data.role === "customer" && !data.customerId) throw new ValidationError("Für die Rolle Kunde muss ein Kunde gewählt werden.");
  if (data.role === "partner" && !data.partnerId) throw new ValidationError("Für die Rolle Partner muss ein Partner gewählt werden.");
  const token = randomToken(32);
  const tenant = (await withSystem((tx) => tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)))[0];
  if (!tenant) throw new NotFoundError();

  const existingMember = await withSystem((tx) =>
    tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.tenantId, tenantId), sql`lower(${users.email}) = ${data.email}`))
      .limit(1),
  );
  if (existingMember[0]) throw new ConflictError("Diese Person ist bereits Mitglied dieses Mandanten.");

  const [inv] = await withTenant(tenantId, (tx) =>
    tx
      .insert(invitations)
      .values({
        tenantId,
        email: data.email,
        role: data.role as RoleKey,
        employeeId: data.employeeId ?? null,
        customerId: data.customerId ?? null,
        partnerId: data.partnerId ?? null,
        tokenHash: sha256(token),
        invitedBy,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      })
      .returning(),
  );
  const link = `${env().APP_URL}/einladung/${token}`;
  const mail = await sendMail({
    to: data.email,
    subject: `Einladung zu DispoRex (${tenant.name})`,
    text: `Sie wurden zu DispoRex eingeladen (${tenant.name}).\n\nEinladung annehmen (7 Tage gültig):\n${link}`,
  });
  // Ohne SMTP (Kanal "log") wird der Link in der Oberfläche angezeigt, damit Admins ihn manuell weitergeben können.
  return { invitation: inv!, link, mailOk: mail.ok && mail.channel === "smtp" };
}

export async function getInvitationByToken(token: string) {
  const row = (
    await withSystem((tx) =>
      tx
        .select({ inv: invitations, tenantName: tenants.name })
        .from(invitations)
        .innerJoin(tenants, eq(tenants.id, invitations.tenantId))
        .where(and(eq(invitations.tokenHash, sha256(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
        .limit(1),
    )
  )[0];
  return row ?? null;
}

export const acceptInviteSchema = z.object({ name: z.string().trim().min(2).max(120), password: passwordSchema });

export async function acceptInvitation(token: string, input: z.infer<typeof acceptInviteSchema>, meta: { ip?: string; userAgent?: string } = {}) {
  const data = acceptInviteSchema.parse(input);
  const found = await getInvitationByToken(token);
  if (!found) throw new ValidationError("Die Einladung ist ungültig oder abgelaufen.");
  const inv = found.inv;
  const passwordHash = await hashPassword(data.password);
  const user = await withSystem(async (tx) => {
    let user = (
      await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${inv.email.toLowerCase()}`)
        .limit(1)
    )[0];
    if (!user) {
      user = (await tx.insert(users).values({ email: inv.email, name: data.name, passwordHash, status: "active" }).returning())[0]!;
    } else if (!user.passwordHash || user.status === "invited") {
      await tx.update(users).set({ passwordHash, status: "active", name: data.name }).where(eq(users.id, user.id));
    }
    await tx
      .insert(memberships)
      .values({ tenantId: inv.tenantId, userId: user.id, role: inv.role, employeeId: inv.employeeId, customerId: inv.customerId, partnerId: inv.partnerId })
      .onConflictDoNothing();
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    return user;
  });
  await securityLog("auth.invitation_accepted", { userId: user.id, tenantId: inv.tenantId, ip: meta.ip });
  const session = await createSession({ userId: user.id, tenantId: inv.tenantId, ip: meta.ip, userAgent: meta.userAgent, reauth: true });
  return { user, session };
}

export async function logoutLog(userId: string) {
  await securityLog("auth.logout", { userId }).catch((err) => logger.warn({ err }, "Logout-Protokoll fehlgeschlagen"));
}
