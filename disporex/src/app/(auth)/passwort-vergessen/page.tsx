import Link from "next/link";
import { ActionForm } from "@/components/ui/form";
import { Field, Input } from "@/components/ui";
import { forgotAction } from "../actions";

export const metadata = { title: "Passwort vergessen" };

export default function ForgotPage() {
  return (
    <div>
      <h1 className="text-[22px]">Passwort zurücksetzen</h1>
      <p className="text-ink-3 text-[13px] mt-1 mb-5">Wir senden Ihnen einen Link, der 60 Minuten gültig ist.</p>
      <ActionForm action={forgotAction} submitLabel="Link anfordern" className="space-y-3">
        <Field label="E-Mail-Adresse" htmlFor="email">
          <Input id="email" name="email" type="email" required autoFocus />
        </Field>
      </ActionForm>
      <p className="mt-5 text-[13px]">
        <Link href="/login">Zurück zur Anmeldung</Link>
      </p>
    </div>
  );
}
