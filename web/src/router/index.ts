import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { requiresGuest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/auth/RegisterView.vue'),
      meta: { requiresGuest: true },
    },
    // Sprint 2A — e-posta & şifre akışları (auth gerektirmez, guest redirect yok)
    {
      path: '/verify-email',
      name: 'verify-email',
      component: () => import('@/views/auth/VerifyEmailView.vue'),
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/auth/ForgotPasswordView.vue'),
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/auth/ResetPasswordView.vue'),
    },
    // Sprint 2B — 2FA login challenge
    {
      path: '/login/2fa',
      name: 'login-2fa',
      component: () => import('@/views/auth/TwoFactorChallengeView.vue'),
    },
    // Sprint 2B — e-posta değişim landing'leri
    {
      path: '/email/change/confirm',
      name: 'email-change-confirm',
      component: () => import('@/views/auth/EmailChangeConfirmView.vue'),
    },
    {
      path: '/email/change/undo',
      name: 'email-change-undo',
      component: () => import('@/views/auth/EmailChangeUndoView.vue'),
    },
    // Sprint 2B — güvenlik ayarları
    {
      path: '/settings/security',
      name: 'settings-security',
      component: () => import('@/views/settings/SecurityView.vue'),
      meta: { requiresAuth: true },
    },
    // Davet linki — giriş yapılmamışsa login'e (redirect ile) yönlendirilir
    {
      path: '/invite/:code',
      name: 'invite',
      component: () => import('@/views/invite/InviteAcceptView.vue'),
      meta: { requiresAuth: true },
    },
    // Yasal — auth gerektirmez
    {
      path: '/gizlilik',
      name: 'gizlilik',
      component: () => import('@/views/legal/GizlilikView.vue'),
    },
    // Sprint 4B — moderasyon kuyruğu (mod-only, guard view içinde)
    {
      path: '/moderation',
      name: 'moderation',
      component: () => import('@/views/moderation/ModerationView.vue'),
      meta: { requiresAuth: true },
    },
    // Uygulama kabuğu (kalıcı çerçeve) + nested ekran view'ları. Parent path '/' (kanıtlanmış nested
    // desen); ana ekran '/channels/@me'ye taşındı (eski ''). '/' kullanıcıya Caddy'de landing'e gider,
    // SPA'ya ulaşmaz; ulaşırsa catch-all app'e yönlendirir.
    // Standart: stack/frontend/component-organization §Routing — URL = ekranın tek doğruluk kaynağı.
    {
      path: '/',
      component: () => import('@/views/app/AppShell.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          // Discord-tarzı app ana ekranı (eski ''). name değişmez → tüm { name: 'app' } nav'ı korunur.
          path: 'channels/@me',
          name: 'app',
          components: {
            default: () => import('@/views/home/HomeView.vue'),
            sidebar: () => import('@/views/home/components/HomeSidebar.vue'),
          },
        },
        {
          path: 'channels/:guildId/:channelId',
          name: 'channel',
          components: {
            default: () => import('@/views/app/GuildChannelView.vue'),
            sidebar: () => import('@/components/layout/ChannelPanel.vue'),
          },
          props: { default: true },
        },
        {
          path: 'dm/:channelId',
          name: 'dm',
          components: {
            default: () => import('@/views/home/DmView.vue'),
            sidebar: () => import('@/views/home/components/HomeSidebar.vue'),
          },
          props: { default: true },
        },
        // Sprint C6 — Keşfet (Ortam Keşfi). Sidebar slot = DiscoverSidebar (canonical rail|sidebar|içerik ızgarası).
        {
          path: 'discover',
          name: 'discover',
          components: {
            default: () => import('@/views/discover/DiscoverView.vue'),
            sidebar: () => import('@/views/discover/components/DiscoverSidebar.vue'),
          },
        },
      ],
    },
    {
      // Bilinmeyen app yolu → app ana ekranı (/channels/@me). '/' SPA'da yok; Caddy onu landing'e yollar.
      path: '/:pathMatch(.*)*',
      redirect: { name: 'app' },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.ready) {
    await auth.init()
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated()) {
    // Korumalı hedefe (örn. /invite/:code) giriş sonrası geri dönebilmek için redirect taşı
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresGuest && auth.isAuthenticated()) {
    return { name: 'app' }
  }
})

export default router
