<script setup lang="ts">
// Tanıtım tek-sayfası — bölümleri compose eder. SEO/OG meta burada.
// og:image: 1200x630 marka kartı (public/og.png — gen-og.mjs ile üretildi).
const title = 'Kankaverse: Türkiye’nin topluluk ve sohbet platformu'
const description =
  'Kankaverse, Türkiye için topluluk tabanlı sesli ve yazılı sohbet platformu. Sunucular, kanallar, arkadaş grupları; Türkçe arayüz, KVKK uyumlu, yerli ve güvenli.'
const url = 'https://kankaverse.com/'
const image = 'https://kankaverse.com/og.png'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  ogUrl: url,
  ogImage: image,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageType: 'image/png',
  ogLocale: 'tr_TR',
  ogSiteName: 'Kankaverse',
  twitterCard: 'summary_large_image',
  twitterTitle: title,
  twitterDescription: description,
  twitterImage: image,
})

// Structured data — Google markayı/sitesi anlasın (snippet/sitelink, ileride knowledge panel).
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Kankaverse',
      url: 'https://kankaverse.com',
      logo: 'https://kankaverse.com/kankaverse-logo.png',
      description: 'Türkiye için topluluk tabanlı sesli ve yazılı sohbet platformu.',
    },
    {
      '@type': 'WebSite',
      name: 'Kankaverse',
      url: 'https://kankaverse.com',
      inLanguage: 'tr-TR',
    },
  ],
}

useHead({
  link: [{ rel: 'canonical', href: url }],
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd) }],
})
</script>

<template>
  <div>
    <LandingHero />
    <main>
      <LandingValue />
      <LandingSafety />
      <LandingCta />
    </main>
    <LandingFooter />
  </div>
</template>
