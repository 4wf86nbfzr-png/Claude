import type { MetadataRoute } from 'next'
import { SITE } from '@/data/farm'
import { PRODUCTS } from '@/data/products'

export default function sitemap(): MetadataRoute.Sitemap {
  const statisch = ['', '/hof', '/produkte', '/bio', '/team', '/hofladen', '/galerie', '/kontakt']

  return [
    ...statisch.map((path) => ({
      url: `${SITE.url}${path}`,
      changeFrequency: 'monthly' as const,
      priority: path === '' ? 1 : 0.8,
    })),
    ...PRODUCTS.map((p) => ({
      url: `${SITE.url}/produkte/${p.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
