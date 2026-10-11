import Link from "next/link";
import { ActionForm, FieldError } from "@/components/ui/form";
import { Field, Input } from "@/components/ui";
import { signupAction } from "../actions";

export const metadata = { title: "Registrieren" };

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-[22px]">Unternehmen registrieren</h1>
      <p className="text-ink-3 text-[13px] mt-1 mb-5">Sie legen Ihr Unternehmen als eigenen Mandanten an und werden dessen Administrator.</p>
      <ActionForm action={signupAction} submitLabel="Konto anlegen" className="space-y-3">
                    <Field label="Unternehmen" htmlFor="companyName">
              <Input id="companyName" name="companyName" required minLength={2} maxLength={120} autoFocus />
              <FieldError name="companyName" />
            </Field>
            <Field label="Ihr Name" htmlFor="name">
              <Input id="name" name="name" required minLength={2} autoComplete="name" />
              <FieldError name="name" />
            </Field>
            <Field label="E-Mail-Adresse" htmlFor="email">
              <Input id="email" name="email" type="email" required autoComplete="email" />
              <FieldError name="email" />
            </Field>
            <Field label="Passwort" htmlFor="password" help="Mindestens 10 Zeichen.">
              <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
              <FieldError name="password" />
            </Field>
      </ActionForm>
      <p className="mt-5 text-[13px]">
        Bereits ein Konto? <Link href="/login">Anmelden</Link>
      </p>
    </div>
  );
}
