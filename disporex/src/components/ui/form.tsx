"use client";

import { useActionState, useContext, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-result";
import { Alert, Button } from "./index";
import { FormStateContext } from "./form-context";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Formular mit Server Action und Fehlerdarstellung. Funktioniert ohne JS
 * (klassischer POST) und mit JS (ohne Neuladen). Feldfehler über <FieldError name=…/>.
 */
export function ActionForm({ action, children, submitLabel = "Speichern", submitVariant = "primary", className, successMessage, confirm, reset, extraButtons }: {
  action: Action;
  children: ReactNode;
  submitLabel?: string;
  submitVariant?: "primary" | "accent" | "secondary" | "danger";
  className?: string;
  successMessage?: string;
  confirm?: string;
  reset?: boolean;
  extraButtons?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  // Nach erfolgreichem Absenden Formular leeren (nur wenn gewünscht): Schlüssel hochzählen,
  // als Zustandsableitung während des Renderns (kein Effekt nötig).
  const [formKey, setFormKey] = useState(0);
  const [seenState, setSeenState] = useState<ActionState>(null);
  if (reset && state?.ok && state !== seenState) {
    setSeenState(state);
    setFormKey((k) => k + 1);
  }
  return (
    <FormStateContext.Provider value={state}>
      <form
        action={formAction}
        className={className}
        key={formKey}
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        {state?.error && (
          <Alert tone="danger" className="mb-3">
            {state.error}
          </Alert>
        )}
        {state?.ok && (successMessage || state.message) && (
          <Alert tone="ok" className="mb-3 whitespace-pre-wrap break-all">
            {state.message ?? successMessage}
          </Alert>
        )}
        {children}
        <div className="mt-4 flex items-center gap-2">
          <Button type="submit" variant={submitVariant} disabled={pending} aria-busy={pending}>
            {pending ? "Bitte warten …" : submitLabel}
          </Button>
          {extraButtons}
        </div>
      </form>
    </FormStateContext.Provider>
  );
}

/** Kleiner Aktionsknopf (z. B. in Tabellenzeilen), der eine Server Action auslöst. */
export function ActionButton({ action, label, variant = "secondary", size = "sm", confirm, hidden, className }: {
  action: Action;
  label: string;
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  size?: "sm";
  confirm?: string;
  hidden?: Record<string, string>;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className ?? "inline"}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" variant={variant} size={size} disabled={pending} title={state?.error}>
        {label}
      </Button>
      {state?.error && <span className="ml-2 text-[12px] text-danger">{state.error}</span>}
    </form>
  );
}

export function FieldError({ name }: { name: string }) {
  const state = useContext(FormStateContext);
  const msg = state?.fieldErrors?.[name];
  return msg ? <p className="error">{msg}</p> : null;
}
