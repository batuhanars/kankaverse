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
    {
      path: '/',
      name: 'app',
      component: () => import('@/views/app/AppView.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: 'channels/:guildId/:channelId',
          name: 'channel',
          component: () => import('@/views/app/AppView.vue'),
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.ready) {
    await auth.init()
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated()) {
    return { name: 'login' }
  }

  if (to.meta.requiresGuest && auth.isAuthenticated()) {
    return { name: 'app' }
  }
})

export default router
