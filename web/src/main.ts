import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { i18n } from './i18n'
import router from './router'
import App from './App.vue'
import { installChunkReload } from './lib/chunkReload'
import { installSessionEndHandler } from './api/sessionEnd'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.mount('#app')

// D63 — dağıtım sonrası bayat parça öz-onarımı. mount SONRASI: handler içinde Pinia store'ları
// (toast, voice) çağrılıyor, aktif pinia gerekiyor.
installChunkReload(router)

// D108 — oturum sonu (kv:auth:expired) kökte bir kez dinlenir; store temizlenir, sonra login.
installSessionEndHandler(router)

// Açılış splash'ını (index.html) gizle: router ilk navigasyonu + auth.init() /me
// kontrolünü bitirince (guard await ediyor) → fade-out. Failsafe: takılırsa 8sn sonra zorla.
function hideSplash() {
  const splash = document.getElementById('app-splash')
  if (!splash || splash.classList.contains('is-hidden')) return
  splash.classList.add('is-hidden')
  splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
router.isReady().then(hideSplash)
setTimeout(hideSplash, 8000)
