"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";

/**
 * Ohne Netz bleibt der Warenkorb erhalten (localStorage) — der Hinweis
 * sagt genau das, statt nur "offline" zu melden.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          role="status"
          className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-saffron px-4 py-2 text-center text-[0.8125rem] font-semibold text-ink"
        >
          <WifiOff className="size-4" aria-hidden />
          Keine Verbindung — dein Warenkorb bleibt gespeichert.
        </motion.div>
      )}
    </AnimatePresence>
  );
}
