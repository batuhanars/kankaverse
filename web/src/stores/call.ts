import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface IncomingCall {
  channelId: string
  caller: { id: string; username: string; avatarUrl: string | null }
  /**
   * 🔴 M4b §14.1 — çağrının türü. Alan YOKSA `'dm'` (1-1 daveti, `voice.incoming_call`): mevcut
   * çağıranların hiçbiri değişmedi. `'group'` grup DM'in `voice.group_call_started`'ıdır; sunum
   * aynı modaldır, ayrım yalnız metin ve sinyalde — grupta kabul/reddet sunucuya GÖNDERİLMEZ
   * (`voice:call_accept`/`voice:call_reject` sunucuda `otherDmMember` ile "kendisi olmayan ilk
   * üye"yi buluyor; grup kanalında hedef rastgele bir üye olurdu). Bkz. composables/useCall.ts.
   */
  kind?: 'dm' | 'group'
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

  function setOutgoing(channelId: string) {
    outgoing.value = { channelId }
  }
  function clearOutgoing() {
    outgoing.value = null
  }
  function isRinging(channelId: string) {
    return outgoing.value?.channelId === channelId
  }

  function setIncoming(call: IncomingCall) {
    incoming.value = call
  }
  function clearIncoming() {
    incoming.value = null
  }

  function setNotice(msg: string) {
    notice.value = msg
  }
  function clearNotice() {
    notice.value = ''
  }

  return {
    outgoing,
    incoming,
    notice,
    setOutgoing,
    clearOutgoing,
    isRinging,
    setIncoming,
    clearIncoming,
    setNotice,
    clearNotice,
  }
})
