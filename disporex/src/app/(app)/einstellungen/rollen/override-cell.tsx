"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-result";

export function OverrideCell({ role, permission, defaultAllowed, override, effective, editable, action }: {
  role: string;
  permission: string;
  defaultAllowed: boolean;
  override: boolean | null;
  effective: boolean;
  editable: boolean;
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [, formAction, pending] = useActionState(action, null);
  const title = override === null ? "Standard" : override ? "zusätzlich erlaubt" : "entzogen";
  if (!editable) {
    return (
      <span className={`badge ${effective ? "badge-ok" : "badge-neutral"}`} title={title}>
        {effective ? "ja" : "–"}
        {override !== null && "*"}
      </span>
    );
  }
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="permission" value={permission} />
      <select
        name="value"
        className="input py-0.5 text-[12px] w-auto"
        defaultValue={override === null ? "default" : override ? "allow" : "deny"}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label={`${permission} für ${role}`}
      >
        <option value="default">Standard ({defaultAllowed ? "ja" : "nein"})</option>
        <option value="allow">erlauben</option>
        <option value="deny">entziehen</option>
      </select>
    </form>
  );
}
