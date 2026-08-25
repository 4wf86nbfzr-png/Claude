import type { MetadataRoute } from "next";
import { BRAND } from "@/data/config";

/**
 * PWA-Manifest — die App laesst sich auf den Startbildschirm legen und
 * startet dann ohne Browserleiste.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — ${BRAND.claim}`,
    short_name: BRAND.name,
    description: "Doener, Pizza und Croque sichtbar selbst zusammenstellen.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A090B",
    theme_color: "#0A090B",
    lang: "de",
    categories: ["food", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Doener bauen", url: "/bauen/doener" },
      { name: "Pizza bauen", url: "/bauen/pizza" },
      { name: "Warenkorb", url: "/warenkorb" },
    ],
  };
}
