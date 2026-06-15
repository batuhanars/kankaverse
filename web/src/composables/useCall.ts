import { useSocket } from './useSocket'
import { useCallStore } from '@/stores/call'
import { useVoiceStore } from '@/stores/voice'

/**
 * useCall — DM sesli arama akışı (ring + grup katıl) + timeout yönetimi.
 * Sinyaller useSocket'te; ses voice store'da. Sözleşme: SPRINT_V2_DM_CALL_CONTRACT.md.
 */
const CALL_TIMEOUT_MS = 30_000

export function useCall() {
  const { callInvite, groupCallStart, callAccept, callReject, callCancel } = useSocket()
  const callStore = useCallStore()
  const voiceStore = useVoiceStore()

  // 1-1: ara
  async function startCall(channelId: string) {
    const ack = await callInvite(channelId)
    if (!ack.ok) {
      callStore.setNotice('unreachable') // nötr — engellenme/ilişki sızmaz
      return
    }
    callStore.setOutgoing(channelId)
    window.setTimeout(() => {
      if (callStore.isRinging(channelId)) cancelCall(channelId)
    }, CALL_TIMEOUT_MS)
  }

  function cancelCall(channelId: string) {
    callCancel(channelId)
    callStore.clearOutgoing()
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
