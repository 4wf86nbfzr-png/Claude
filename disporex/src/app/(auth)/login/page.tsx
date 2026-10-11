import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, FieldError } from "@/components/ui/form";
import { Field, Input, Alert } from "@/components/ui";
import { loginAction } from "../actions";
import { getCurrent } from "@/server/auth/current";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; hinweis?: string; grund?: string }> }) {
  const sp = await searchParams;
  const current = await getCurrent();
  if (current && sp.grund !== "kein-mandant") redirect("/dashboard");
  return (
    <div>
      <h1 className="text-[22px]">Anmelden</h1>
      <p className="text-ink-3 text-[13px] mt-1 mb-5">Mit Ihrem DispoRex-Konto.</p>
      {sp.hinweis === "passwort-gesetzt" && (
        <Alert tone="ok" className="mb-4">
          Passwort gesetzt. Sie können sich jetzt anmelden.
        </Alert>
      )}
      {sp.grund === "kein-mandant" && (
        <Alert tone="warn" className="mb-4">
          Ihr Konto ist keinem aktiven Unternehmen zugeordnet. Bitte wenden Sie sich an Ihren Administrator.
        </Alert>
      )}
      <ActionForm action={loginAction} submitLabel="Anmelden" className="space-y-3">
                    <input type="hidden" name="next" value={sp.next ?? ""} />
            <Field label="E-Mail-Adresse" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
              <FieldError name="email" />
            </Field>
            <Field label="Passwort" htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>
      </ActionForm>
      <div className="mt-5 flex justify-between text-[13px]">
        <Link href="/passwort-vergessen">Passwort vergessen?</Link>
        <Link href="/registrieren">Unternehmen registrieren</Link>
      </div>
    </div>
  );
}
