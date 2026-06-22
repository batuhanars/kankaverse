// Kankaverse tanıtım sitesi — Nuxt SSG (statik üretim, çalışan Node sunucusu YOK).
// `npm run generate` → .output/public statik klasör → nginx ile servis (web/ ile aynı desen).
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: true,
  devServer: { port: 3030 }, // api 3000 ile çakışmasın
  // Tek sayfa; netlik için prerender'ı açıkça '/' ile sabitle (generate zaten zorlar)
  nitro: { prerender: { routes: ['/'] } },
  app: {
    head: {
      htmlAttrs: { lang: 'tr' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1.0' }],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
  css: [
    '@fontsource/figtree/400.css',
    '@fontsource/figtree/600.css',
    '@fontsource/figtree/700.css',
    '~/assets/css/tokens.css',
    '~/assets/css/main.css',
  ],
})
