import { ActionForm, FieldError } from "@/components/ui/form";
import { Field, Input, Alert } from "@/components/ui";
import { acceptInviteAction } from "../../actions";
import { getInvitationByToken } from "@/server/auth/service";
import { ROLE_LABELS } from "@/server/auth/permissions";
import Link from "next/link";

export const metadata = { title: "Einladung" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getInvitationByToken(token);
  if (!found) {
    return (
      <div>
        <h1 className="text-[22px]">Einladung ungültig</h1>
        <Alert tone="warn" className="mt-4">
          Diese Einladung ist abgelaufen oder wurde bereits verwendet. Bitten Sie Ihren Administrator um eine neue Einladung.
        </Alert>
        <p className="mt-5 text-[13px]">
          <Link href="/login">Zur Anmeldung</Link>
        </p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-[22px]">Einladung annehmen</h1>
      <p className="text-ink-3 text-[13px] mt-1 mb-5">
        <strong className="text-ink">{found.tenantName}</strong> lädt <span className="mono">{found.inv.email}</span> als {ROLE_LABELS[found.inv.role]} ein.
      </p>
      <ActionForm action={acceptInviteAction} submitLabel="Konto anlegen und anmelden" className="space-y-3">
                    <input type="hidden" name="token" value={token} />
            <Field label="Ihr Name" htmlFor="name">
              <Input id="name" name="name" required minLength={2} autoFocus autoComplete="name" />
              <FieldError name="name" />
            </Field>
            <Field label="Passwort" htmlFor="password" help="Mindestens 10 Zeichen. Falls Sie bereits ein DispoRex-Konto mit dieser Adresse haben, bleibt Ihr bisheriges Passwort gültig.">
              <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
              <FieldError name="password" />
            </Field>
      </ActionForm>
    </div>
  );
}
