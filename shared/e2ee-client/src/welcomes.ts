// Bekleyen Welcome'lar: gruba katılma (E1 §2.4). Kimlik doğrulama çekirdekte: Welcome'daki ağacın
// HER yaprağı sunucu listesine karşı bayt-bayt doğrulanır, tanınmayan varsa katılım reddedilir.
import { NoMatchingKeyPackageError, joinFromWelcome, type Device } from '@kankaverse/e2ee-core'
import type { E2eeWelcomeRow } from './ports'
import { fromB64, toB64 } from './b64'
import { guardUntrusted } from './commitSync'
import type { E2eeContext } from './context'
import { e2eeErrorTag, isChannelGoneError } from './errors'
import { observeLeaves } from './deviceNotices'
import { topUpKeyPackages } from './deviceSetup'
import { devicesOf } from './registry'
import { isStaleGroup } from './staleGroup'

/**
 * Yerel grup yoksa, bu cihaz gruptan çıkarılmışsa ya da yerel grup BAYATSA (groupId sunucudakiyle
 * uyuşmuyor, §6.4) katılınır; aksi halde Welcome bayat sayılır. Sunucu durumu okunamazsa hata çıkar,
 * yerel grup silinmez.
 */
async function joinOne(ctx: E2eeContext, device: Device, row: E2eeWelcomeRow): Promise<boolean> {
  const { data } = await ctx.api.channelState(row.channelId)
  const local = await ctx.store.loadGroup(row.channelId)
  const activeLocal = local && local.isActive && !isStaleGroup(local, data) ? local : null
  const devices = devicesOf(data)
  const { registered } = devices // iptaller ve eski üyeler dahil: ağaçta geçmişten kalan yaprak olabilir
  const group = await guardUntrusted(ctx, row.channelId, () =>
    joinFromWelcome(device, fromB64(row.welcome), registered),
  )
  // Sunucunun güncel grubuna ait olmayan Welcome (eski grubun artığı) işlenmez, yerel durum bozulmaz.
  if (data.groupId && toB64(group.groupId) !== data.groupId) return false
  // Yerel grup aktif görünüyorsa Welcome yalnız DAHA YENİ epoch'a aitse işlenir: cihaz çıkarıldı ama çıkarma
  // commit'ini hiç işlemedi (soket odasından düştü) ve geri eklendi (sahip bulgusu 2026-11-13). Aynı ya da
  // eski epoch'taki Welcome bayattır; atılır.
  if (activeLocal && group.epoch <= activeLocal.epoch) return false
  // Katılma KeyPackage'ı tüketir: önce cihaz, sonra grup diske (yarıda kalırsa Welcome yeniden gelir).
  await ctx.store.saveDevice(device)
  await ctx.store.saveGroup(row.channelId, group)
  await ctx.store.saveJoinedAt(row.channelId, Date.now())
  await observeLeaves(ctx, row.channelId, group, devices) // E2 §3.3: bu andan sonraki eklemeler "yeni cihaz"
  if (local && !local.isActive) ctx.warn(row.channelId, null) // çıkarılmıştık, geri eklendik: "çıkarıldı" bandı kalkar
  return true
}

type Outcome = 'joined' | 'done' | 'retry'

/**
 * 🔴 R7 — C77 §2: tek Welcome'ın sonucu. Hata bu Welcome'da kalır, çağırana fırlamaz:
 *  - `done` (ack'lenir, bir daha gelmez): katılındı/bayat; cihazda eşleşen paket yok; kanal yok ya da erişim yok
 *    (404/403, `isChannelGoneError`: silinmiş istek kanalı vb.).
 *  - `retry` (ack YOK, sunucuda bekler, sonraki tetiklemede yeniden): ağ/5xx, tanınmayan cihaz (uyarı `guardUntrusted`'da
 *    verildi, Welcome kanıt olarak kalır) ve sınıflanmamış her hata. Kuşkuda Welcome düşürülmez.
 */
async function tryOne(ctx: E2eeContext, device: Device, row: E2eeWelcomeRow): Promise<Outcome> {
  try {
    return (await joinOne(ctx, device, row)) ? 'joined' : 'done'
  } catch (e) {
    if (e instanceof NoMatchingKeyPackageError) return 'done'
    const gone = isChannelGoneError(e)
    ctx.log?.(`[e2ee] Welcome atlandı (${gone ? 'kalıcı' : 'sonra'}): ${e2eeErrorTag(e)}`)
    return gone ? 'done' : 'retry'
  }
}

/**
 * Welcome'ları sunucu sırasıyla işler ve ack'ler. Katılınan kanal kimlikleri döner (ardından senkron çalışır).
 * C77 §2: bir Welcome'ın hatası diğerlerini DURDURMAZ (silinmiş tek kanal tüm sohbetleri kilitliyordu). Sıra kuralı:
 * bir kanalın Welcome'ı `retry` kalırsa o kanalın SONRAKİ Welcome'ları da bu tur işlenmez (kanal içi sıra bozulmaz);
 * diğer kanallar devam eder. Ack hatası da yalnız o Welcome'ı etkiler (yeniden gelir, bayat sayılıp ack'lenir).
 */
export async function processWelcomes(ctx: E2eeContext): Promise<string[]> {
  const { data } = await ctx.api.welcomes()
  if (data.length === 0) return []
  const device = await ctx.getDevice()
  const joined: string[] = []
  const held = new Set<string>() // bu tur `retry` kalan kanallar
  for (const row of data) {
    if (held.has(row.channelId)) continue
    const outcome = await tryOne(ctx, device, row)
    if (outcome === 'retry') {
      held.add(row.channelId)
      continue
    }
    if (outcome === 'joined') joined.push(row.channelId)
    await ctx.api.ackWelcome(row.id).catch((e) => ctx.log?.(`[e2ee] Welcome ack: ${e2eeErrorTag(e)}`))
  }
  await topUpKeyPackages(ctx.api, ctx.store, device)
  return joined
}
