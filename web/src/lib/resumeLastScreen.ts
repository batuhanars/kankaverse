/**
 * C38 — Kaldığın yerden aç. Cihaz yerel, kullanıcı kimliğine bağlı kayıt: `kv.resume.<userId>`.
 * Yalnız kimlikler tutulur (ortam/kanal/DM kanal id); kanal adı, mesaj içeriği ASLA.
 * Sesli kanal hiç kaydedilmez (mikrofonun istemeden açılması gizlilik kazasıdır).
 */
import type { RouteLocationRaw } from 'vue-router'
import type { ChannelDto } from '@/types'

type LastTarget =
  { kind: 'channel'; guildId: string; channelId: string } | { kind: 'dm'; channelId: string }

interface ResumeRecord {
  last?: LastTarget
  /** guildId -> son metin kanalı id (en eski girdi başta; üst sınır MAX_GUILDS) */
  guilds: Record<string, string>
}

const KEY_PREFIX = 'kv.resume.'
const MAX_GUILDS = 100

// Soğuk açılışta yönlendirilen kanalın, görünümde doğrulanması için (sessiz varsayılana düşüş)
let pendingResumeChannelId: string | null = null

function key(userId: string) {
  return KEY_PREFIX + userId
}

function read(userId: string): ResumeRecord {
  try {
    const raw = localStorage.getItem(key(userId))
    if (raw) {
      const parsed = JSON.parse(raw) as ResumeRecord
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.guilds &&
        typeof parsed.guilds === 'object'
      )
        return parsed
    }
  } catch {
    /* bozuk kayıt: boş say */
  }
  return { guilds: {} }
}

function write(userId: string, rec: ResumeRecord) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(rec))
  } catch {
    /* depolama dolu/kapalı: sessiz geç */
  }
}

export function clearResume(userId: string | undefined | null) {
  if (!userId) return
  try {
    localStorage.removeItem(key(userId))
  } catch {
    /* yoksay */
  }
}

/** Metin kanalı kaydı. Sesli/kilitli kanal için çağrılmaz. */
export function saveTextChannel(userId: string, guildId: string, channelId: string) {
  const rec = read(userId)
  delete rec.guilds[guildId]
  rec.guilds[guildId] = channelId
  const ids = Object.keys(rec.guilds)
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX_GUILDS))) delete rec.guilds[old]
  rec.last = { kind: 'channel', guildId, channelId }
  write(userId, rec)
}

/** Kullanıcı sesli kanal ekranındaysa: o ortamın son metin kanalı son sohbet olarak kalır. */
export function saveVoiceScreen(userId: string, guildId: string) {
  const rec = read(userId)
  const channelId = rec.guilds[guildId]
  if (!channelId) return
  rec.last = { kind: 'channel', guildId, channelId }
  write(userId, rec)
}

export function saveDm(userId: string, channelId: string) {
  const rec = read(userId)
  rec.last = { kind: 'dm', channelId }
  write(userId, rec)
}

/** Erişilemeyen hedefin kaydını sil (hem son sohbet hem ortam haritası). */
export function forgetChannel(userId: string, channelId: string) {
  const rec = read(userId)
  for (const g of Object.keys(rec.guilds)) if (rec.guilds[g] === channelId) delete rec.guilds[g]
  if (rec.last?.channelId === channelId) delete rec.last
  write(userId, rec)
}

/**
 * Ortam tıklaması: o ortamdaki son metin kanalı (listede varsa, metinse, kilitli değilse), yoksa
 * bugünkü davranış (ilk kanal). Geçersiz kayıt silinir.
 */
export function pickChannelForGuild(
  userId: string | undefined,
  guildId: string,
  channels: ChannelDto[],
): string | undefined {
  if (userId) {
    const saved = read(userId).guilds[guildId]
    if (saved) {
      const ch = channels.find((c) => c.id === saved)
      if (ch && ch.type === 'GUILD_TEXT' && !ch.locked) return saved
      forgetChannel(userId, saved)
    }
  }
  return channels[0]?.id
}

/** Soğuk açılış hedefi (açık hedefsiz /channels/@me girişi için). Doğrulama görünümde yapılır. */
export function resumeRoute(userId: string): RouteLocationRaw | null {
  const last = read(userId).last
  if (!last) return null
  if (last.kind === 'dm')
    return { name: 'dm', params: { channelId: last.channelId }, replace: true }
  pendingResumeChannelId = last.channelId
  return {
    name: 'channel',
    params: { guildId: last.guildId, channelId: last.channelId },
    replace: true,
  }
}

/** Kanal görünümü: bu kanala açılış resume ile mi oldu? (bir kez tüketilir) */
export function consumeResume(channelId: string): boolean {
  const hit = pendingResumeChannelId === channelId
  pendingResumeChannelId = null
  return hit
}
