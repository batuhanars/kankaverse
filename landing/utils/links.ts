// Landing CTA hedefleri — tek yerden (Nuxt utils/ otomatik import eder).
// App ayrı tier (web/) → absolute URL. Davet/iletişim sıfır-altyapı: mailto.
export const LOGIN_URL = 'https://kankaverse.com/login'
export const REGISTER_URL = 'https://kankaverse.com/register'
export const INVITE_MAILTO = 'mailto:kankaverse@gmail.com?subject=Kankaverse%20davet%20talebi'
export const RULES_URL = 'https://kankaverse.com/kurallar'
export const PRIVACY_URL = 'https://kankaverse.com/gizlilik'
export const CONTACT_MAILTO = 'mailto:kankaverse@gmail.com'

// Masaüstü installer — Caddy /indir/* → VPS /srv/downloads. Dosyalar sabit adla tutulur
// (sürüm gömülmez → link her build'de aynı kalır). macOS (dmg) henüz build edilmedi.
export const DOWNLOAD_WIN_URL = 'https://kankaverse.com/indir/kankaverse-setup.exe'
export const DOWNLOAD_LINUX_URL = 'https://kankaverse.com/indir/kankaverse.AppImage'

// Android — Play mağaza sayfası (üretim sürümü 2026-09-05'te yayınlandı, paket
// `com.kankaverse.app`). Masaüstü linklerinin aksine kendi sunucumuzdan servis
// EDİLMEZ: mağaza sayfasına gider, o yüzden `download` niteliği YOK, yeni sekmede açılır.
export const DOWNLOAD_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.kankaverse.app'
