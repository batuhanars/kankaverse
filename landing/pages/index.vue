<script setup lang="ts">
// Tanıtım tek-sayfası — bölümleri compose eder. SEO/OG meta burada.
// NOT: og:image şimdilik apple-touch-icon (kare). Lansman öncesi 1200x630 /og.png eklenmeli.
const title = 'Kankaverse — Türkiye’nin sohbet evreni'
const description =
  'Toplulukların, oyuncuların ve arkadaş gruplarının sesli ve yazılı buluştuğu güvenli sohbet platformu. Türkçe, yerli ve güvenli.'
const url = 'https://kankaverse.com/'
const image = 'https://kankaverse.com/apple-touch-icon.png'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  ogUrl: url,
  ogImage: image,
  ogLocale: 'tr_TR',
  ogSiteName: 'Kankaverse',
  twitterCard: 'summary_large_image',
  twitterTitle: title,
  twitterDescription: description,
  twitterImage: image,
})

useHead({
  link: [{ rel: 'canonical', href: url }],
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
