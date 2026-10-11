import { ActionForm } from "@/components/ui/form";
import { Field, Input } from "@/components/ui";
import { reauthAction } from "@/app/(app)/einstellungen/actions";

/** Passwortbestätigung für sensible Aktionen (15 Minuten gültig). */
export function ReauthBox() {
  return (
    <div className="alert alert-warn mb-4 max-w-xl">
      <p className="font-medium mb-2">Sensible Aktionen erfordern eine Passwortbestätigung.</p>
      <ActionForm action={reauthAction} submitLabel="Bestätigen" submitVariant="secondary" className="[&>div]:mt-2">
        <Field label="Ihr Passwort" htmlFor="reauth-pw">
          <Input id="reauth-pw" name="password" type="password" autoComplete="current-password" required className="max-w-xs" />
        </Field>
      </ActionForm>
    </div>
  );
}
