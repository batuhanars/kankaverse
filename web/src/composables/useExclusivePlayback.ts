/**
 * M6b §8.3/§8.4 — merkezi oynatma durumu (mobil ile aynı model).
 *
 * - `currentId`: şu an çalan ek id'si. Oynatıcı çalmaya başlarken kendi id'sini yazar; her oynatıcı
 *   `currentId`yi izler ve çalarken `currentId !== kendi id` olursa KENDİNİ duraklatır (emir değil, efekt).
 * - Sıra: mesaj listesi bileşeni kronolojik CLEAN ses ek id'lerini kaydeder (`useAudioQueue`).
 *   Bir ses SONUNA KADAR çalıp bitince `playNext` sıradakini `autoplayId` ile başlatır. Elle
 *   duraklatma `ended` üretmediği için geçiş yapmaz. Sıradaki mount değilse sessizce olmaz.
 */
import { ref, watch, onBeforeUnmount, type Ref } from 'vue'
import { ScanStatus, type MessageDto } from '@/types'

const currentId = ref<string | null>(null)
const autoplayId = ref<string | null>(null)
const queues = new Map<string, string[]>()

function play(id: string) {
  currentId.value = id
}

/** Yalnız hâlâ benim çalan olduğum durumda bırak (başkası devralmışsa dokunma). */
function stop(id: string) {
  if (currentId.value === id) currentId.value = null
}

function setQueue(channelId: string, ids: string[]) {
  queues.set(channelId, ids)
}

function clearQueue(channelId: string) {
  queues.delete(channelId)
}

/** Biten sesin ardından aynı sohbette sıradaki sesi başlat; yoksa dur. */
function playNext(id: string) {
  for (const ids of queues.values()) {
    const i = ids.indexOf(id)
    if (i === -1) continue
    const next = ids[i + 1]
    if (next) {
      autoplayId.value = next
      currentId.value = next
    } else {
      stop(id)
    }
    return
  }
  stop(id)
}

/** Otomatik başlatma bana mı verildi? Verildiyse bayrağı tüketir. */
function consumeAutoplay(id: string): boolean {
  if (autoplayId.value !== id) return false
  autoplayId.value = null
  return true
}

export function useExclusivePlayback() {
  return { currentId, play, stop, playNext, consumeAutoplay }
}

/** Mesaj listesi bileşeni çağırır: ekrandaki sohbetin ses sırasını merkezi duruma yazar. */
export function useAudioQueue(
  channelId: () => string | null | undefined,
  messages: Ref<MessageDto[]>,
) {
  let registered: string | null = null
  watch(
    [channelId, messages],
    ([cid, list]) => {
      if (registered && registered !== cid) clearQueue(registered)
      registered = cid ?? null
      if (!cid) return
      const ids = list.flatMap((m) =>
        (m.attachments ?? [])
          .filter((a) => a.contentType.startsWith('audio/') && a.scanStatus === ScanStatus.CLEAN)
          .map((a) => a.id),
      )
      setQueue(cid, ids)
    },
    { immediate: true, deep: true },
  )
  onBeforeUnmount(() => {
    if (registered) clearQueue(registered)
  })
}
