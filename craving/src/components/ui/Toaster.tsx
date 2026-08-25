"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, TriangleAlert, X } from "lucide-react";
import { useUiStore, type Toast } from "@/stores/ui-store";

const icons = {
  success: Check,
  info: Info,
  error: TriangleAlert,
} as const;

const tones = {
  success: "text-basil",
  info: "text-saffron",
  error: "text-danger",
} as const;

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((s) => s.dismiss);
  const Icon = icons[toast.tone];

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="glass pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl p-4 shadow-(--shadow-deep)"
    >
      <Icon className={`mt-0.5 size-[18px] shrink-0 ${tones[toast.tone]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{toast.title}</p>
        {toast.description && <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{toast.description}</p>}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="-m-1 rounded-full p-1 text-muted transition hover:text-paper"
        aria-label="Hinweis schliessen"
      >
        <X className="size-4" aria-hidden />
      </button>
    </motion.li>
  );
}

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <ul
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-8 lg:right-8 lg:left-auto lg:items-end lg:px-0"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </ul>
  );
}
