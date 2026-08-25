"use client";

import { motion } from "framer-motion";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

/**
 * Seitenwechsel.
 *
 * Bewusst nur ein kurzes Aufblenden ohne Verschiebung: eine bewegte Seite
 * waehrend des Wechsels stoert die Scroll-Wiederherstellung und kostet auf
 * dem Telefon spuerbar Zeit. Die Struktur bleibt in jedem Fall gleich —
 * bei reduzierter Bewegung faellt nur die Dauer auf null.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotionSafe();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.16, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
