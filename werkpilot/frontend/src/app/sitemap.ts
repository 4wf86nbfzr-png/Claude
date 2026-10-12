import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/funktionen", "/branchen", "/preise", "/demo", "/hilfe", "/kontakt", "/registrieren", "/anmelden", "/impressum", "/datenschutz", "/agb", "/widerruf"];
  return pages.map((p) => ({ url: `${SITE}${p}`, lastModified: new Date(), changeFrequency: p === "" ? "weekly" : "monthly", priority: p === "" ? 1 : 0.7 }));
}
