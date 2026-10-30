import type { Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * C38 — Kaldığın yerden aç (web `lib/resumeLastScreen.ts` ikizi). Cihaz yerel, kullanıcı kimliğine
 * bağlı kayıt: `kv.resume.<userId>`. Yalnız kimlikler; kanal adı/mesaj içeriği ASLA. Sesli kanal
 * ekranı (/call) hiç kaydedilmez. Çıkışta silinir (`stores/auth.ts` logout).
 */
type LastTarget =
  | { kind: 'channel'; guildId: string; channelId: string }
  | { kind: 'dm'; channelId: string };

interface ResumeRecord {
  last?: LastTarget;
  /** guildId -> son metin kanalı (en eski girdi başta; üst sınır MAX_GUILDS). */
  guilds: Record<string, string>;
}

const KEY_PREFIX = 'kv.resume.';
const MAX_GUILDS = 100;

// Soğuk açılışta başarıyla geri yüklenen ortam: ana ekran o ortam seçili açılır (bir kez tüketilir).
let resumedGuildId: string | null = null;

async function read(userId: string): Promise<ResumeRecord> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + userId);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      const rec = parsed as Partial<ResumeRecord>;
      if (rec.guilds && typeof rec.guilds === 'object') return rec as ResumeRecord;
    }
  } catch {
    // bozuk kayıt: boş say
  }
  return { guilds: {} };
}

async function write(userId: string, rec: ResumeRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + userId, JSON.stringify(rec));
  } catch {
    // depolama hatası sessiz
  }
}

export async function clearResume(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + userId);
  } catch {
    // sessiz
  }
}

export async function saveTextChannel(
  userId: string,
  guildId: string,
  channelId: string,
): Promise<void> {
  const rec = await read(userId);
  delete rec.guilds[guildId];
  rec.guilds[guildId] = channelId;
  const ids = Object.keys(rec.guilds);
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX_GUILDS))) delete rec.guilds[old];
  rec.last = { kind: 'channel', guildId, channelId };
  await write(userId, rec);
}

/**
 * Mobilde DM / grup DM geri yüklenmez (gizlilik: telefon başkasının elindeyken özel konuşma
 * açılmasın). DM ekranı ve ana ekran DM görünümü son sohbeti "yok"a çeker; ortam haritası kalır.
 */
export async function clearLast(userId: string): Promise<void> {
  const rec = await read(userId);
  if (!rec.last) return;
  delete rec.last;
  await write(userId, rec);
}

/** Ana ekranda ortam kanal listesi görünümü: son sohbet = o ortamın son kanalı (haritada yoksa yok). */
export async function setLastToGuild(userId: string, guildId: string): Promise<void> {
  const rec = await read(userId);
  const channelId = rec.guilds[guildId];
  if (channelId) rec.last = { kind: 'channel', guildId, channelId };
  else delete rec.last;
  await write(userId, rec);
}

/** Erişilemeyen hedefin kaydını sil (son sohbet + ortam haritası). */
export async function forgetChannel(userId: string, channelId: string): Promise<void> {
  const rec = await read(userId);
  for (const g of Object.keys(rec.guilds)) if (rec.guilds[g] === channelId) delete rec.guilds[g];
  if (rec.last?.channelId === channelId) delete rec.last;
  await write(userId, rec);
}

export async function getLastTarget(userId: string): Promise<LastTarget | null> {
  return (await read(userId)).last ?? null;
}

/** Ana ekranda ortam seçilince son kanalı vurgulamak için (otomatik açılmaz). */
export async function getGuildChannelMap(userId: string): Promise<Record<string, string>> {
  return (await read(userId)).guilds;
}

export function setResumedGuild(guildId: string | null): void {
  resumedGuildId = guildId;
}

export function takeResumedGuild(): string | null {
  const g = resumedGuildId;
  resumedGuildId = null;
  return g;
}

// Soğuk açılışta çözülen sohbet rotası: Index yalnız /home'a replace eder, home odaklanınca bunu
// push eder (replace ile push'un aynı tikte yarışması yutuluyordu). Bir kez tüketilir.
let pendingTarget: Href | null = null;

export function setPendingTarget(href: Href | null): void {
  pendingTarget = href;
}

export function takePendingTarget(): Href | null {
  const h = pendingTarget;
  pendingTarget = null;
  return h;
}
