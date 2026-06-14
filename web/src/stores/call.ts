import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface IncomingCall {
  channelId: string
  caller: { id: string; username: string; avatarUrl: string | null }
}

/**
 * Call store — DM sesli arama sinyalizasyon durumu (1-1 ring + grup başlatma bildirimi).
 * Çağrının kendisi (ses) voice store'da; bu yalnız davet/çalma durumu.
 * Sözleşme: contracts/SPRINT_V2_DM_CALL_CONTRACT.md.
 */
export const useCallStore = defineStore('call', () => {
  // Giden çağrı: biz arıyoruz, karşı taraf çalıyor (ringing)
  const outgoing = ref<{ channelId: string } | null>(null)
  // Gelen çağrı: bizi arıyorlar
  const incoming = ref<IncomingCall | null>(null)
  // Nötr bilgi (ulaşılamadı / reddedildi) — engellenme/ilişki sızdırmaz
  const notice = ref<string>('')

  function setOutgoing(channelId: string) { outgoing.value = { channelId } }
  function clearOutgoing() { outgoing.value = null }
  function isRinging(channelId: string) { return outgoing.value?.channelId === channelId }

  function setIncoming(call: IncomingCall) { incoming.value = call }
  function clearIncoming() { incoming.value = null }

  function setNotice(msg: string) { notice.value = msg }
  function clearNotice() { notice.value = '' }

  return {
    outgoing, incoming, notice,
    setOutgoing, clearOutgoing, isRinging,
    setIncoming, clearIncoming,
    setNotice, clearNotice,
  }
})
