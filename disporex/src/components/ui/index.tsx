"use client";

import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { useRetainedValue } from "./form-context";

type Cls = { className?: string };
const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export function Button({ variant = "secondary", size, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "accent" | "secondary" | "ghost" | "danger"; size?: "sm" }) {
  return <button className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)} {...props} />;
}

export function LinkButton({ href, variant = "secondary", size, className, children }: { href: string; variant?: "primary" | "accent" | "secondary" | "ghost" | "danger"; size?: "sm"; children: ReactNode } & Cls) {
  return (
    <Link href={href} className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)}>
      {children}
    </Link>
  );
}

export function Input({ className, defaultValue, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const retained = useRetainedValue(props.type === "password" || props.type === "file" ? undefined : props.name);
  return <input className={cx("input", className)} defaultValue={retained ?? defaultValue} {...props} />;
}
export function Select({ className, defaultValue, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const retained = useRetainedValue(props.name);
  return <select className={cx("input", className)} defaultValue={retained ?? defaultValue} {...props} />;
}
export function Textarea({ className, defaultValue, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const retained = useRetainedValue(props.name);
  return <textarea className={cx("input", className)} defaultValue={retained ?? defaultValue} {...props} />;
}

export function Field({ label, htmlFor, help, error, children, className }: { label: string; htmlFor?: string; help?: string; error?: string; children: ReactNode } & Cls) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="error">{error}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  );
}

export function Panel({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; padded?: boolean } & Cls) {
  return (
    <section className={cx("panel", className)}>
      {title !== undefined && (
        <header className="panel-head">
          <h2 className="panel-title">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export type BadgeTone = "neutral" | "ok" | "warn" | "danger" | "info" | "accent";
export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode } & Cls) {
  return <span className={cx("badge", `badge-${tone}`, className)}>{children}</span>;
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "ok" | "warn" | "danger"; children: ReactNode } & Cls) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("alert", `alert-${tone}`, className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: string; subtitle?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        {breadcrumb && <div className="text-[12px] text-ink-3 mb-1">{breadcrumb}</div>}
        <h1 className="text-[20px] leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-ink-3 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="text-[14px] font-medium text-ink-2">{title}</p>
      {hint && <p className="text-[13px] text-ink-3 mt-1 max-w-md mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode } & Cls) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="tbl">{children}</table>
    </div>
  );
}

export function Kpi({ value, label, href, tone }: { value: number | string; label: string; href?: string; tone?: BadgeTone }) {
  const inner = (
    <>
      <span className={cx("kpi-value", tone === "danger" && "text-danger", tone === "warn" && "text-warn")}>{value}</span>
      <span className="kpi-label">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="kpi no-underline text-inherit">
      {inner}
    </Link>
  ) : (
    <div className="kpi">{inner}</div>
  );
}

export function Pagination({ page, totalPages, total, hrefFor }: { page: number; totalPages: number; total: number; hrefFor: (p: number) => string }) {
  if (totalPages <= 1) return <p className="text-[12.5px] text-ink-3 px-1 py-2">{total} Einträge</p>;
  return (
    <nav className="flex items-center justify-between gap-2 px-1 py-2 text-[12.5px] text-ink-3" aria-label="Seiten">
      <span>
        Seite {page} von {totalPages} · {total} Einträge
      </span>
      <span className="flex gap-1">
        {page > 1 && (
          <Link className="btn btn-secondary btn-sm" href={hrefFor(page - 1)}>
            Zurück
          </Link>
        )}
        {page < totalPages && (
          <Link className="btn btn-secondary btn-sm" href={hrefFor(page + 1)}>
            Weiter
          </Link>
        )}
      </span>
    </nav>
  );
}

export function Dl({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-[13px]">
      {items.map((it) => (
        <div key={it.k} className="contents">
          <dt className="text-ink-3">{it.k}</dt>
          <dd className="text-ink">{it.v ?? <span className="text-ink-4">–</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export { cx };
