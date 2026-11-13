import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { createSessionEndHandler } from '@/api/sessionEndHandler'
import { SIGNED_OUT_EVENT } from '@/api/tabRefresh'

// D108 — gerçek oturum sonu TEK yerden, kökte (AppShell'e bağlı değil): önce auth store temizlenir
// (user=null + token; yoksa router'ın requiresGuest kapısı kullanıcıyı login'den geri uygulamaya atar),
// sonra login'e gidilir. E2EE yerel deposu, bugünkü çıkış akışıyla aynı muameleyi görür (clearAuth -> wipe).
/** main.ts'te bir kez çağrılır. `kv:auth:expired`: bu sekmede oturum bitti; signed-out: başka sekme çıkış yaptı. */
export function installSessionEndHandler(router: Router): void {
  const handler = createSessionEndHandler({
    clearAuth: () => useAuthStore().clearAuth(),
    goToLogin: ({ expired }) => {
      const current = router.currentRoute.value
      const query: Record<string, string> = {}
      if (expired) query.expired = '1'
      if (current.meta.requiresAuth) query.redirect = current.fullPath
      return router.replace({ name: 'login', query })
    },
  })
  window.addEventListener('kv:auth:expired', () => void handler.end(true))
  window.addEventListener(SIGNED_OUT_EVENT, () => void handler.end(false))
}
