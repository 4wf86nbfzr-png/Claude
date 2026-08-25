import type { MetadataRoute } from "next";
import { BRAND, DEMO_MODE } from "@/data/config";

export default function robots(): MetadataRoute.Robots {
  // Testbetrieb: nichts indexieren lassen. Nach dem Live-Gang DEMO_MODE
  // in data/config.ts auf false setzen.
  if (DEMO_MODE) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/kasse", "/warenkorb", "/konto", "/bestellungen"] },
    ],
    sitemap: `${BRAND.url}/sitemap.xml`,
  };
}
