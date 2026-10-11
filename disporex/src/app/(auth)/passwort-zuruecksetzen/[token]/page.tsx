import { ActionForm, FieldError } from "@/components/ui/form";
import { Field, Input } from "@/components/ui";
import { resetAction } from "../../actions";

export const metadata = { title: "Neues Passwort" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div>
      <h1 className="text-[22px]">Neues Passwort setzen</h1>
      <p className="text-ink-3 text-[13px] mt-1 mb-5">Alle anderen Sitzungen werden danach beendet.</p>
      <ActionForm action={resetAction} submitLabel="Passwort speichern" className="space-y-3">
                    <input type="hidden" name="token" value={token} />
            <Field label="Neues Passwort" htmlFor="password" help="Mindestens 10 Zeichen.">
              <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" autoFocus />
              <FieldError name="_" />
            </Field>
            <Field label="Passwort wiederholen" htmlFor="password2">
              <Input id="password2" name="password2" type="password" required minLength={10} autoComplete="new-password" />
            </Field>
      </ActionForm>
    </div>
  );
}
