"use client";

import { forwardRef, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

type Variant = "primary" | "ghost" | "outline" | "quiet";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-full font-semibold " +
  "transition-[background,color,border-color,transform,box-shadow] duration-200 " +
  "disabled:cursor-not-allowed disabled:opacity-40 select-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-ember text-white hover:bg-ember-2 shadow-(--shadow-ember) active:scale-[0.98]",
  outline: "border border-line-strong text-paper hover:border-paper hover:bg-white/5 active:scale-[0.98]",
  ghost: "text-chrome hover:text-paper hover:bg-white/5",
  quiet: "bg-ink-3 text-paper hover:bg-ink-4 border border-line",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[0.8125rem]",
  md: "h-12 px-6 text-[0.9375rem]",
  lg: "h-14 px-8 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Desktop: der Knopf folgt dem Zeiger leicht. */
  magnetic?: boolean;
}

/**
 * Magnetischer Effekt nur mit feinem Zeiger und ohne Reduced Motion —
 * auf Touch waere er wirkungslos und wuerde nur Rechenzeit kosten.
 */
function useMagnet(enabled: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const reduced = useReducedMotionSafe();
  const active = enabled && !reduced;

  const onMove = (e: React.MouseEvent) => {
    if (!active || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * 0.22;
    const y = (e.clientY - (r.top + r.height / 2)) * 0.3;
    setOffset({ x, y });
  };
  const onLeave = () => setOffset({ x: 0, y: 0 });

  return { ref, offset, onMove, onLeave, active };
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", magnetic = false, className, children, ...props },
  forwardedRef,
) {
  const { ref: magnetRef, offset, onMove, onLeave, active } = useMagnet(magnetic);

  const setRef = (node: HTMLButtonElement | null) => {
    magnetRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  return (
    <motion.button
      ref={setRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      animate={active ? { x: offset.x, y: offset.y } : undefined}
      transition={{ type: "spring", stiffness: 260, damping: 18, mass: 0.4 }}
      className={clsx(base, variants[variant], sizes[size], className)}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {children}
    </motion.button>
  );
});

export interface ButtonLinkProps extends React.ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={clsx(base, variants[variant], sizes[size], className)} {...props} />;
}
