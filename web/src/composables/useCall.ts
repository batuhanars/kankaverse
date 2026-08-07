import { effectScope, watch } from 'vue'
import { useSocket } from './useSocket'
import { useCallStore } from '@/stores/call'
import { useVoiceStore } from '@/stores/voice'
import { useCallSounds } from '@/composables/useCallSounds'

/**
 * useCall — DM sesli arama akışı: "oda önce" (SPRINT_D39). Telefon düğmesi arayanı doğrudan odaya
 * sokar (ack.ok → join, beklemeden); karşı taraf çalar. `voice.call_accepted` yalnız "çalıyor"
 * göstergesini düşürür (useSocket.ts). Arayan-tarafı sabit zaman aşımı YOK — oda ömrünü
 * voiceStore'un yalnız-kalma ayrımı belirler (bkz. stores/voice.ts §4).
 * Sinyaller useSocket'te; ses voice store'da. Sözleşme: SPRINT_D39_WEB_CALL_MODEL_CONTRACT.md.
 */

// D39 §5 — geri-zil (ringback): eskiden OutgoingCallBar'ın watch'ındaydı, bar kalktığı için
// sahipsiz kalırdı. Çağrı yaşam döngüsünün zaten sahibi burası (useCall). Detached effect scope:
// useCall() hangi component'ten ilk çağrılırsa çağrılsın (DmConversation/IncomingCallModal), o
// component unmount olsa da callStore.outgoing yaşadığı sürece bağımsız çalışmaya devam eder.
let ringbackScope: ReturnType<typeof effectScope> | null = null
function ensureRingback() {
  if (ringbackScope) return
  ringbackScope = effectScope(true)
  ringbackScope.run(() => {
    const callStore = useCallStore()
    const { startRingback, stopRingback } = useCallSounds()
    watch(
      () => callStore.outgoing?.channelId,
      (id) => {
        if (id) startRingback()
        else stopRingback()
      },
    )
  })
}

export function useCall() {
  const { callInvite, groupCallStart, callAccept, callReject } = useSocket()
  const callStore = useCallStore()
  const voiceStore = useVoiceStore()
  ensureRingback()

  // 1-1: ara — oda-önce (§2): ack.ok → BEKLEMEDEN odaya katıl, karşı taraf çalar.
  // ack.ok === false → nötr mesaj, odaya hiç girilmez (§3).
  async function startCall(channelId: string, opts?: { startWithCamera?: boolean }) {
    const ack = await callInvite(channelId)
    if (!ack.ok) {
      callStore.setNotice('unreachable') // nötr — engellenme/ilişki sızmaz
      return
    }
    callStore.setOutgoing(channelId)
    await voiceStore.join(channelId, {
      autoEndWhenAlone: true,
      startWithCamera: opts?.startWithCamera,
    })
  }

  // İptal — kapanış tek nokta (§2/§11): voiceStore.leave() hâlâ çalıyorsak call_cancel'ı
  // kendi gönderir (stores/voice.ts cancelRingingIfNeeded), burada tekrarlanmaz.
  function cancelCall(channelId: string) {
    if (voiceStore.isConnectedTo(channelId)) void voiceStore.leave()
  }

  // Gelen çağrıyı kabul → katıl
  async function acceptCall(channelId: string) {
    callAccept(channelId)
    callStore.clearIncoming()
    await voiceStore.join(channelId, { autoEndWhenAlone: true }) // REV-12: DM çağrısı
  }

  function rejectCall(channelId: string) {
    callReject(channelId)
    callStore.clearIncoming()
  }

  // Grup: sese katıl (yoksa başlat-bildir + katıl)
  async function startGroupCall(channelId: string) {
    if (voiceStore.isConnectedTo(channelId)) return
    await groupCallStart(channelId)
    await voiceStore.join(channelId, { autoEndWhenAlone: true }) // REV-12: grup çağrısı
  }

  return { startCall, cancelCall, acceptCall, rejectCall, startGroupCall }
}
