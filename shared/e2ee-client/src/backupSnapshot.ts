// Yedek görüntüsünün içeriği ve geri yükleme birleştirmesi (E5a §4.2, §4.5). Saf işlevler: ağ, depo, kilit yok.
// 🔴 R7: birleştirme kuralı yerel `ok` kaydı ezmemeli ve erişilemeyen kanalı geri getirmemeli.
import { BackupSnapshotError, fromUtf8, SNAPSHOT_VERSION } from '@kankaverse/e2ee-core'
import type { StoredMessage } from './localStore'

/** Görüntüye giren kayıt: yalnız gövdesi olanlar (`ok`, `unverified`). */
export interface SnapshotMessage {
  id: string
  channelId: string
  status: 'ok' | 'unverified'
  body: string
  digest: string
  fk?: string
  sentAt?: number
}

/** Şifrelenen düz içerik (§2.2): cihaz/grup durumu, MLS anahtarı, bayrak GİRMEZ. */
export interface SnapshotContent {
  v: number
  deviceId: string
  /** Görüntünün kurulduğu an (ms): aynı mesajın iki sürümünden yenisini seçmek için. */
  createdAt: number
  messages: SnapshotMessage[]
}

const isBackedUp = (m: StoredMessage): m is StoredMessage & { status: SnapshotMessage['status'] } =>
  m.status === 'ok' || m.status === 'unverified'

/** Yerel kayıtlardan görüntü kurar; alanlar tek tek seçilir (depoya sonradan eklenen alan sızmasın). */
export function buildSnapshot(deviceId: string, createdAt: number, records: StoredMessage[]): SnapshotContent {
  const messages = records.filter(isBackedUp).map((m) => ({
    id: m.id,
    channelId: m.channelId,
    status: m.status,
    body: m.body,
    digest: m.digest,
    ...(m.fk !== undefined && { fk: m.fk }),
    ...(m.sentAt !== undefined && { sentAt: m.sentAt }),
  }))
  return { v: SNAPSHOT_VERSION, deviceId, createdAt, messages }
}

const isText = (x: unknown): x is string => typeof x === 'string'

function isSnapshotMessage(x: unknown): x is SnapshotMessage {
  const m = x as Partial<SnapshotMessage> | null
  return (
    typeof m === 'object' &&
    m !== null &&
    isText(m.id) &&
    isText(m.channelId) &&
    (m.status === 'ok' || m.status === 'unverified') &&
    isText(m.body) &&
    isText(m.digest) &&
    (m.fk === undefined || isText(m.fk)) &&
    (m.sentAt === undefined || typeof m.sentAt === 'number')
  )
}

/** Açılmış düz baytı görüntüye çevirir. Sürüm/cihaz tutmuyorsa hata; biçimi bozuk tek kayıt atlanır. */
export function parseSnapshot(plain: Uint8Array, expectedDeviceId: string): SnapshotContent {
  const raw = JSON.parse(fromUtf8(plain)) as Partial<SnapshotContent> | null
  if (!raw || raw.v !== SNAPSHOT_VERSION) throw new BackupSnapshotError('Görüntü sürümü desteklenmiyor')
  if (raw.deviceId !== expectedDeviceId) throw new BackupSnapshotError('Görüntü cihazı uyuşmuyor')
  if (typeof raw.createdAt !== 'number' || !Array.isArray(raw.messages)) {
    throw new BackupSnapshotError('Görüntü biçimi bozuk')
  }
  return {
    v: raw.v,
    deviceId: raw.deviceId,
    createdAt: raw.createdAt,
    messages: raw.messages.filter(isSnapshotMessage),
  }
}

const rank = (m: SnapshotMessage) => (m.status === 'ok' ? 2 : 1)

/**
 * Birden çok görüntüden her mesaj için TEK aday seçer (§4.5): `ok` > `unverified`; eşit derecede
 * (iki `ok` farklı özetle = düzenlenmiş sürüm) `createdAt`'i yeni olan görüntünün kaydı kazanır.
 * Görüntüler eskiden yeniye gezilir, eşitlikte sonraki (yeni) değiştirir.
 */
export function pickCandidates(snapshots: SnapshotContent[]): Map<string, SnapshotMessage> {
  const oldestFirst = [...snapshots].sort((a, b) => a.createdAt - b.createdAt)
  const picked = new Map<string, SnapshotMessage>()
  for (const snap of oldestFirst) {
    for (const m of snap.messages) {
      const current = picked.get(m.id)
      if (!current || rank(m) >= rank(current)) picked.set(m.id, m)
    }
  }
  return picked
}

/**
 * Yerel kayıt ile gelen aday (§4.5 tablosu): yerelde yok → yaz; yerelde çözülememiş
 * (`undecryptable|failed|unsupported`) → yaz; yerelde `unverified` + gelen `ok` → yaz; yerelde `ok` → DOKUNMA.
 * Yerelde `unverified` + gelen `unverified`: kazanç yok, yazılmaz.
 */
export function shouldWrite(local: StoredMessage | null, incoming: SnapshotMessage): boolean {
  if (!local) return true
  if (local.status === 'ok') return false
  if (local.status === 'unverified') return incoming.status === 'ok'
  return true // undecryptable | failed | unsupported
}
