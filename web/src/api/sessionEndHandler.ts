// D108 — gerçek oturum sonu mantığı (saf; test edilebilir). Kurulum: sessionEnd.ts.
export interface SessionEndDeps {
  clearAuth: () => void
  goToLogin: (opts: { expired: boolean }) => Promise<unknown>
  // Oturum gerektiren bir sayfada mıyız? Değilse (şifre sıfırlama, e-posta doğrulama, yasal sayfalar)
  // kullanıcı yerinden edilmez: oturumu hiç olmayan ziyaretçinin açılış /me denemesi de buraya düşer.
  onProtectedPage: () => boolean
}

export function createSessionEndHandler(deps: SessionEndDeps) {
  let ending = false
  async function end(expired: boolean): Promise<void> {
    if (ending) return // eşzamanlı birden çok 401/auth_error tek oturum sonu sayılır
    ending = true
    try {
      deps.clearAuth()
      if (deps.onProtectedPage()) await deps.goToLogin({ expired })
    } finally {
      ending = false
    }
  }
  return { end }
}
