import { effectScope, watch } from 'vue'
import { useSocket } from './useSocket'
import { useCallStore } from '@/stores/call'
import { useVoiceStore } from '@/stores/voice'
import { useAuthStore } from '@/stores/auth'
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

  // 🔴 M4b §14.1 — grup DM'de gelen çağrının kabul/reddi sunucuya SİNYAL GÖNDERMEZ. Sunucudaki
  // `voice:call_accept`/`voice:call_reject` karşı tarafı `otherDmMember` ile buluyor; o fonksiyon
  // "kendisi olmayan İLK üye"yi döndürdüğü için grup kanalında hedef RASTGELE bir üye olurdu
  // (yanlış kişide "arama reddedildi" bildirimi + odadan atılma). Arayan zaten odada; kimin
  // reddettiğini bilmesi de gerekmiyor. 1-1 dalı satır satır aynı kaldı.
  const isGroupIncoming = () => callStore.incoming?.kind === 'group'

  // Gelen çağrıyı kabul → katıl
  async function acceptCall(channelId: string) {
    const group = isGroupIncoming()
    if (!group) callAccept(channelId)
    callStore.clearIncoming()
    // Grup çağrısında da yalnız-kalma zaman aşımı açık (sözleşme §3: grup DM bir çağrıdır, mekân
    // değil) — `startGroupCall`/`onGroupVoiceClick` ile aynı seçenek.
    await voiceStore.join(channelId, { autoEndWhenAlone: true }) // REV-12: DM çağrısı
  }

  function rejectCall(channelId: string) {
    const group = isGroupIncoming()
    if (!group) callReject(channelId)
    callStore.clearIncoming() // grupta TEK yaptığımız bu: yerel kapatma (zil de burada susar)
  }

  // 🔴 "Sonradan katılan kimseyi çaldırmaz" kuralı BURADA, tek noktada (PM 2026-08-07).
  // Önceden çağıranda (`DmConversation.onGroupVoiceClick`) duruyordu ve doğru çalışıyordu, ama
  // kural çağırana bağlıydı: ikinci bir çağıran kontrolü unutsa gruptaki HERKES yeniden çalardı.
  // Mobil bunu doğru yerde yapıyor (`stores/voice.ts` `alreadyOngoing`), web de aynı hizada.
  //
  // 🔴 ACK KONTROLÜ (sahip bulgusu 2026-08-08): eskiden `groupCallStart`ın dönüşü YOK SAYILIYORDU.
  // Sunucu `NOT_GROUP`/`FORBIDDEN` dönse bile web sessizce odaya giriyor, karşı taraf çalmıyor ve
  // kullanıcı hiçbir uyarı görmüyordu — "web'ten çağrı düşmüyor" semptomu tam buydu. Mobil bu
  // kontrolü baştan yapıyordu (`stores/voice.ts`), web'de eksikti. Hata ayrımı kullanıcıya
  // AÇIMLANMAZ: 1-1 ile aynı nötr metin (T&S).
  async function startGroupCall(channelId: string) {
    if (voiceStore.isConnectedTo(channelId)) return
    // Kendimi hariç tut: presence listesi bayat/hayalet bir kendi kaydımı taşırsa `alreadyOngoing`
    // yanlışlıkla true olur ve çağrı sinyali hiç gitmezdi (aynı sessiz başarısızlık sınıfı).
    const myId = useAuthStore().user?.id
    const others = voiceStore.participantsFor(channelId).filter((p) => p.userId !== myId)
    if (others.length === 0) {
      const ack = await groupCallStart(channelId)
      if (!ack.ok) {
        callStore.setNotice('unreachable') // nötr — sebep sızmaz
        return
      }
    }
    await voiceStore.join(channelId, { autoEndWhenAlone: true }) // REV-12: grup çağrısı
  }

  return { startCall, cancelCall, acceptCall, rejectCall, startGroupCall }
}
