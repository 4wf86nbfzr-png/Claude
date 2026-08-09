import type { MetadataRoute } from 'next'
import { SITE } from '@/data/farm'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/impressum', '/datenschutz'] },
    sitemap: `${SITE.url}/sitemap.xml`,
  }
}
