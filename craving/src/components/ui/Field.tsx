"use client";

import { useId } from "react";

/**
 * Formularfeld mit Label, Fehlerzustand und Hilfetext.
 * Fehler stehen unter dem Feld und sind ueber aria-describedby verknuepft —
 * ein rot gefaerbter Rahmen allein reicht nicht.
 */
export function Field({
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  autoComplete,
  inputMode,
  placeholder,
  required,
  maxLength,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={className}>
      <label htmlFor={id} className="kicker block">
        {label}
        {required && <span className="ml-1 text-ember">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`mt-2 w-full rounded-xl border bg-ink-2 p-3.5 text-sm placeholder:text-muted focus:outline-none ${
          error ? "border-danger" : "border-line focus:border-line-strong"
        }`}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-[0.8125rem] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
