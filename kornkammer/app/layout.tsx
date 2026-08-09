import type { Metadata, Viewport } from 'next'
import { Fraunces, Hanken_Grotesk, Space_Mono } from 'next/font/google'
import './globals.css'

import SmoothScroll from '@/components/motion/SmoothScroll'
import PageTransition from '@/components/layout/PageTransition'
import Nav from '@/components/layout/Nav'
import Footer from '@/components/layout/Footer'
import { FARM, SITE, ROUTE_URL } from '@/data/farm'

/* Schriften kommen ueber next/font: selbst gehostet, kein Aufruf an Dritte
   beim Seitenaufruf, und damit auch datenschutzseitig unauffaellig. */
const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  axes: ['SOFT', 'WONK', 'opsz'],
  display: 'swap',
  variable: '--f-fraunces',
})

const hanken = Hanken_Grotesk({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--f-hanken',
})

const mono = Space_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--f-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.titleDefault, template: SITE.titleTemplate },
  description: SITE.description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: SITE.locale,
    url: SITE.url,
    siteName: FARM.name,
    title: SITE.titleDefault,
    description: SITE.description,
    images: [{ url: '/video/hero-poster.jpg', width: 1770, height: 3840, alt: FARM.claim }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.titleDefault,
    description: SITE.description,
    images: ['/video/hero-poster.jpg'],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#141009',
  colorScheme: 'dark',
}

/** Strukturierte Daten. Keine Bewertungen — dazu liegt nichts vor. */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE.url}/#organisation`,
      name: FARM.name,
      legalName: FARM.legalName,
      foundingDate: String(FARM.since),
      url: SITE.url,
      sameAs: [FARM.instagram, FARM.shop],
    },
    {
      '@type': ['LocalBusiness', 'Farm'],
      '@id': `${SITE.url}/#hof`,
      name: FARM.legalName,
      parentOrganization: { '@id': `${SITE.url}/#organisation` },
      url: SITE.url,
      telephone: FARM.phone.display,
      email: FARM.email.display,
      hasMap: ROUTE_URL,
      address: {
        '@type': 'PostalAddress',
        streetAddress: FARM.address.street,
        postalCode: FARM.address.zip,
        addressLocality: FARM.address.city,
        addressRegion: FARM.address.region,
        addressCountry: FARM.address.country,
      },
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: 'https://schema.org/Friday',
          opens: `${FARM.hofladen.from.padStart(2, '0')}:00`,
          closes: `${FARM.hofladen.to}:00`,
        },
      ],
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${fraunces.variable} ${hanken.variable} ${mono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Ohne Skripte gibt es keinen Ladevorhang. Die CSS-Notbremse in
            globals.css blendet ihn zwar ohnehin aus, hier verschwindet er
            aber sofort statt nach drei Sekunden. */}
        <noscript>
          <style>{`#loader{display:none!important}`}</style>
        </noscript>

        <a href="#inhalt" className="skip">
          Zum Inhalt springen
        </a>
        <SmoothScroll>
          <Nav />
          <PageTransition>
            <main id="inhalt">{children}</main>
            <Footer />
          </PageTransition>
        </SmoothScroll>
      </body>
    </html>
  )
}
