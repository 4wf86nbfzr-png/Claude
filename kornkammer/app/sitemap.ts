import type { MetadataRoute } from 'next'
import { SITE } from '@/data/farm'
import { PRODUCTS } from '@/data/products'

/* Wird ohnehin zur Bauzeit erzeugt. Die Angabe braucht der statische Export. */
export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const statisch = [
    '',
    '/hof',
    '/produkte',
    '/shop',
    '/bio',
    '/team',
    '/hofladen',
    '/galerie',
    '/kontakt',
    '/referenzen',
  ]

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
