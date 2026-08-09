import type { MetadataRoute } from 'next'
import { SITE } from '@/data/farm'

/* Wird ohnehin zur Bauzeit erzeugt. Die Angabe braucht der statische Export. */
export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/impressum', '/datenschutz'] },
    sitemap: `${SITE.url}/sitemap.xml`,
  }
}
