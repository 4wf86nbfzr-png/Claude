import type { MetadataRoute } from "next";
import { BRAND } from "@/data/config";
import { BUILDER_CATEGORIES } from "@/data/categories";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = BRAND.url;
  const now = new Date();

  const staticRoutes = ["", "/menue", "/bauen", "/rechtliches/allergene", "/rechtliches/impressum", "/rechtliches/datenschutz", "/rechtliches/agb", "/rechtliches/widerruf"];

  return [
    ...staticRoutes.map((path) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.7,
    })),
    ...BUILDER_CATEGORIES.map((c) => ({
      url: `${base}/bauen/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
  ];
}
