/**
 * Sprint C11 — mesaj listesinde tarih ayracı (Bugün · Dün · 25 Ekim 2026).
 *
 * İki kural bu dosyanın varlık sebebi:
 *
 * 1. Gün karşılaştırması **yerel yıl-ay-gün üçlüsü** üzerinden yapılır, saat farkı üzerinden
 *    DEĞİL. `diff < 24h` yanlış olurdu: 23.50'de atılan bir mesaj 00.10'da hâlâ "bugün"
 *    sayılırdı. `createdAt` UTC gelir; `new Date(y, m, d)` cihazın yerel saat dilimine göre
 *    okur — istenen de bu.
 * 2. "Bugün"/"Dün" metni **render anında** hesaplanır, mesaja iliştirilip saklanmaz. Gece
 *    yarısı geçince kayması için `todayStart` reaktiftir: dakikada bir kontrol edilir ve
 *    yalnız gün DEĞİŞTİĞİNDE yazılır (aksi hâlde her dakika gereksiz render olurdu).
 */
import { ref } from 'vue'

/** Verilen anın yerel gününün başlangıcı (00.00) — gün kimliği bu damgadır. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Bugünün gün damgası. Modül düzeyinde tek zamanlayıcı (sekme başına bir tane); bileşenler
// bunu `dayDividerLabel` üzerinden okur, aboneliği Vue kendisi kurar.
const todayStart = ref(startOfLocalDay(new Date()))

setInterval(() => {
  const now = startOfLocalDay(new Date())
  if (now !== todayStart.value) todayStart.value = now
}, 60_000)

/**
 * Bu mesaj yeni bir güne mi ait? (ayraç bu soruya "evet" dendiğinde girer)
 * `prevIso` yoksa (listenin en üstü) → evet, o gün orada başlıyor.
 */
export function isNewDay(iso: string, prevIso?: string | null): boolean {
  if (!prevIso) return true
  return startOfLocalDay(new Date(iso)) !== startOfLocalDay(new Date(prevIso))
}

/** Ayraç metni. `t` çağıranın vue-i18n bağlamından gelir (util kendi örneğini kurmaz). */
export function dayDividerLabel(iso: string, t: (key: string) => string): string {
  const d = new Date(iso)
  const day = startOfLocalDay(d)
  // 🔴 Reaktif okuma: gece yarısı geçip bu damga değişince etiketler yeniden hesaplanır.
  const today = todayStart.value
  if (day === today) return t('message.dateDivider.today')
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (day === startOfLocalDay(yesterday)) return t('message.dateDivider.yesterday')
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}
