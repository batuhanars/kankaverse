import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  Room,
  RoomEvent,
  ParticipantEvent,
  Track,
  type RemoteTrack,
  type Participant,
} from 'livekit-client'
import { voiceApi, type VoiceParticipantDto } from '@/api/voice'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { i18n } from '@/i18n'

export interface VoiceParticipant {
  userId: string
  username: string
  avatarUrl: string | null
}

export interface RoomMember extends VoiceParticipant {
  isLocal: boolean
}

/**
 * Voice store — LiveKit ses kanalları (audio-only v1).
 * İki katman:
 *  - participantsByChannel: ChannelPanel'de "kanalda kim var" (WS + ilk GET ile beslenir) — herkes görür.
 *  - Yerel bağlantı: connectedChannelId + Room (yalnız bağlı kullanıcı; mute/konuşan göstergesi).
 * Sözleşme: contracts/SPRINT_V2_LIVEKIT_CONTRACT.md.
 */
export const useVoiceStore = defineStore('voice', () => {
  // Panel görünümü: kanal → katılımcılar (bağlı olmasak da)
  const participantsByChannel = ref<Record<string, VoiceParticipant[]>>({})

  // Yerel bağlantı durumu
  const connectedChannelId = ref<string | null>(null)
  const connecting = ref(false)
  // REV-8: bağlanılan kanal (connect tamamlanana dek UI "bağlanıyor" kartı göstersin)
  const connectingChannelId = ref<string | null>(null)
  // REV-13: bağlanma anı (görüşme süresi sayacı için)
  const connectedAt = ref<number | null>(null)
  // REV-12: DM/grup çağrısında tek kişi kalınca otomatik bitir
  let autoEndWhenAlone = false
  let aloneTimer: ReturnType<typeof setTimeout> | null = null
  const ALONE_TIMEOUT_MS = 60_000
  const isMuted = ref(false)
  const canPublish = ref(false)
  const error = ref('')
  // Varsayılan tercih: seste olmasak da mikrofon/sağırlık durumu (kalıcı). Bir kanala/aramaya
  // katılınca uygulanır; seste değilken alt bardaki düğmeler bu tercihi değiştirir.
  const preferMuted = ref(localStorage.getItem('kv.voice.preferMuted') === '1')
  const preferDeafened = ref(localStorage.getItem('kv.voice.preferDeafened') === '1')
  // Cihaz tercihleri (kalıcı): giriş (mikrofon) + çıkış (hoparlör) deviceId + çıkış sesi (0–1).
  const inputDeviceId = ref(localStorage.getItem('kv.voice.inputDevice') || 'default')
  const outputDeviceId = ref(localStorage.getItem('kv.voice.outputDevice') || 'default')
  const outputVolume = ref(clampVol(Number(localStorage.getItem('kv.voice.outputVolume') ?? '1')))
  // ActiveSpeakers (yalnız bağlı oda) — userId seti
  const speakingUserIds = ref<Set<string>>(new Set())
  // Kendini sağırlaştır: tüm gelen sesi + kendi mikrofonunu kapatır
  const isDeafened = ref(false)
  // Mikrofon açılamadı nedeni: 'insecure' (güvenli olmayan bağlam, getUserMedia yok) | 'denied' (izin/cihaz) | ''
  const micError = ref<'' | 'insecure' | 'denied'>('')
  // Bağlı odanın CANLI katılımcıları (LiveKit Room'dan; webhook'tan bağımsız, güvenilir)
  const roomParticipants = ref<RoomMember[]>([])
  // Mikrofonu kapalı uzak katılımcılar (TrackMuted/Unmuted)
  const mutedUserIds = ref<Set<string>>(new Set())
  // R11: moderatör (server) susturması — self/track mute'tan AYRI. WS ile beslenir.
  const serverMutedUserIds = ref<Set<string>>(new Set())

  // LiveKit Room — reaktif değil (kompleks nesne)
  let room: Room | null = null
  // Bağlı uzak ses elementleri (sağırlaştırma için muted toggle'lanır)
  const remoteAudioEls = new Set<HTMLMediaElement>()
  // Sağırlaştırma öncesi mute durumu (kaldırınca geri yükle)
  let muteBeforeDeafen = false

  function isConnectedTo(channelId: string): boolean {
    return connectedChannelId.value === channelId
  }

  function clearError() {
    error.value = ''
  }

  function participantsFor(channelId: string): VoiceParticipant[] {
    return participantsByChannel.value[channelId] ?? []
  }

  // REV-13b: kanal aktif-başlangıcı (ms epoch) → sidebar süre sayacı
  const channelStartedAt = ref<Record<string, number | null>>({})
  function startedAtFor(channelId: string): number | null {
    return channelStartedAt.value[channelId] ?? null
  }

  // ── Panel listesi (WS + ilk yük) ────────────────────────────────────────────
  async function loadParticipants(channelId: string) {
    try {
      const res = await voiceApi.getParticipants(channelId)
      participantsByChannel.value[channelId] = res.data.participants.map(toParticipant)
      channelStartedAt.value[channelId] = res.data.startedAt // REV-13b
    } catch {
      participantsByChannel.value[channelId] = []
      channelStartedAt.value[channelId] = null
    }
  }

  function addParticipant(channelId: string, p: VoiceParticipant) {
    const list = participantsByChannel.value[channelId] ?? []
    if (!list.some((x) => x.userId === p.userId)) {
      participantsByChannel.value[channelId] = [...list, p]
    }
    // REV-13b: ilk katılımcı gözlemlendiğinde başlangıç yoksa şimdi (yaklaşık)
    if (!channelStartedAt.value[channelId]) {
      channelStartedAt.value[channelId] = Date.now()
    }
  }

  // ── R11: moderatör (server) susturması ────────────────────────────────────
  // WS voice.participant_muted/unmuted — yalnız o an bağlı olduğumuz kanal için
  // göstergeyi sürdürmemiz yeterli (set bağlı oda kapsamında anlamlı).
  function addServerMute(channelId: string, userId: string) {
    if (connectedChannelId.value !== channelId) return
    const s = new Set(serverMutedUserIds.value); s.add(userId); serverMutedUserIds.value = s
  }
  function removeServerMute(channelId: string, userId: string) {
    if (connectedChannelId.value !== channelId) return
    const s = new Set(serverMutedUserIds.value); s.delete(userId); serverMutedUserIds.value = s
  }
  function isServerMuted(userId: string): boolean {
    return serverMutedUserIds.value.has(userId)
  }

  function removeParticipant(channelId: string, userId: string) {
    const list = participantsByChannel.value[channelId]
    if (list) {
      const next = list.filter((x) => x.userId !== userId)
      participantsByChannel.value[channelId] = next
      if (next.length === 0) channelStartedAt.value[channelId] = null // REV-13b: boş → sıfırla
    }
  }

  // ── Yerel bağlantı ──────────────────────────────────────────────────────────
  async function join(channelId: string, opts?: { autoEndWhenAlone?: boolean }) {
    if (connectedChannelId.value === channelId || connecting.value) return
    if (room) await leave()

    autoEndWhenAlone = opts?.autoEndWhenAlone ?? false
    connecting.value = true
    connectingChannelId.value = channelId
    error.value = ''
    try {
      const { data } = await voiceApi.getToken(channelId)
      canPublish.value = data.canPublish

      // Bit hızı: kanal ayarı publish varsayılanına uygulanır (audio-only maxBitrate, kbps→bps)
      room = new Room({
        publishDefaults: { audioPreset: { maxBitrate: (data.bitrate ?? 64) * 1000 } },
      })
      wireRoom(room)
      await room.connect(data.url, data.token)
      // Tarayıcı autoplay kilidini katılım jesti açar; yine de garantiye al
      try { await room.startAudio() } catch { /* jest gerektirebilir; ses ilk etkileşimde açılır */ }

      connectedChannelId.value = channelId
      connectedAt.value = Date.now() // REV-13: süre sayacı başlangıcı
      refreshRoomParticipants()
      // Konuşma dinleyicilerini bağla (yerel + mevcut uzaklar)
      attachSpeaking(room.localParticipant)
      for (const p of room.remoteParticipants.values()) attachSpeaking(p)

      // Varsayılan susturulmuş tercih → mikrofonu açma (sustur ile katıl)
      if (data.canPublish && !preferMuted.value) {
        try {
          // getUserMedia yalnız güvenli bağlamda (localhost/HTTPS) var; yoksa Firefox hiç sormaz
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('insecure')
          await room.localParticipant.setMicrophoneEnabled(true, micCaptureOpts())
          isMuted.value = false
          micError.value = ''
        } catch (e) {
          // Mikrofon açılamadı → dinleyici kal + NEDENİ görünür yap (sessiz yutma yok)
          isMuted.value = true
          micError.value = !window.isSecureContext || (e as Error)?.message === 'insecure' ? 'insecure' : 'denied'
        }
      } else {
        // Karantina VEYA varsayılan-sustur: dinleyici modu
        isMuted.value = true
      }

      // Varsayılan sağırlık tercihi → katılınca uygula (gelen sesi de sustur)
      if (preferDeafened.value) {
        await applyDeafen(true)
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string; error?: string } } }
      const code = err.response?.data?.error
      // R10 — ses kanalı dolu: toast ile bildir (token-mint 403 CHANNEL_FULL).
      if (code === 'CHANNEL_FULL') {
        useToastStore().error(err.response?.data?.message ?? i18n.global.t('voice.channelFull'))
      }
      error.value = err.response?.data?.message ?? 'Ses kanalına bağlanılamadı.'
      await leave()
    } finally {
      connecting.value = false
      connectingChannelId.value = null
    }
  }

  async function leave() {
    // İyimser: kendini panel listesinden hemen çıkar — webhook participant_left
    // gecikse de çıkan kişinin KENDİ sidebar'ı + süre sayacı anında düzelir.
    // Gözlemciler webhook → voice:<id> ile (presence aboneliği) canlı güncellenir.
    const leftChannelId = connectedChannelId.value
    const selfId = useAuthStore().user?.id
    if (leftChannelId && selfId) removeParticipant(leftChannelId, selfId)

    if (room) {
      try { await room.disconnect() } catch { /* yoksay */ }
      room = null
    }
    resetLocalState()
  }

  function resetLocalState() {
    connectedChannelId.value = null
    connectedAt.value = null // REV-13
    autoEndWhenAlone = false // REV-12
    if (aloneTimer) { clearTimeout(aloneTimer); aloneTimer = null }
    isMuted.value = false
    canPublish.value = false
    isDeafened.value = false
    micError.value = ''
    speakingUserIds.value = new Set()
    roomParticipants.value = []
    mutedUserIds.value = new Set()
    serverMutedUserIds.value = new Set() // R11: oda kapsamlı moderatör-mute göstergesi
    remoteAudioEls.clear()
  }

  // LiveKit Participant → RoomMember (metadata'dan avatar)
  function toRoomMember(p: Participant, localId: string | undefined): RoomMember {
    let avatarUrl: string | null = null
    try { if (p.metadata) avatarUrl = (JSON.parse(p.metadata)?.avatarUrl ?? null) } catch { /* yoksay */ }
    return { userId: p.identity, username: p.name || p.identity, avatarUrl, isLocal: p.identity === localId }
  }

  function refreshRoomParticipants() {
    if (!room) { roomParticipants.value = []; return }
    const localId = room.localParticipant?.identity
    const list: RoomMember[] = [toRoomMember(room.localParticipant, localId)]
    for (const p of room.remoteParticipants.values()) list.push(toRoomMember(p, localId))
    roomParticipants.value = list
  }

  // Konuşan setini tüm katılımcıların isSpeaking'inden yeniden kur (mute/unmute dayanıklı)
  function recomputeSpeaking() {
    if (!room) { speakingUserIds.value = new Set(); return }
    const s = new Set<string>()
    if (room.localParticipant?.isSpeaking) s.add(room.localParticipant.identity)
    for (const p of room.remoteParticipants.values()) if (p.isSpeaking) s.add(p.identity)
    speakingUserIds.value = s
  }

  // Bir katılımcının konuşma değişimini dinle (çift bağlamayı önlemek için önce kaldır)
  function attachSpeaking(p: Participant) {
    p.off(ParticipantEvent.IsSpeakingChanged, recomputeSpeaking)
    p.on(ParticipantEvent.IsSpeakingChanged, recomputeSpeaking)
  }

  function setPreferMuted(v: boolean) {
    preferMuted.value = v
    localStorage.setItem('kv.voice.preferMuted', v ? '1' : '0')
  }
  function setPreferDeafened(v: boolean) {
    preferDeafened.value = v
    localStorage.setItem('kv.voice.preferDeafened', v ? '1' : '0')
  }

  async function toggleMute() {
    // Seste değilken: yalnız varsayılan tercihi çevir (sonraki katılışta uygulanır)
    if (!room) {
      setPreferMuted(!preferMuted.value)
      return
    }
    if (!canPublish.value) return
    const next = !isMuted.value
    try {
      await room.localParticipant.setMicrophoneEnabled(!next, next ? undefined : micCaptureOpts())
      isMuted.value = next
      setPreferMuted(next) // tercih son seçimi izler
      // Sağırken mikrofonu açmak sağırlığı da kaldırır (Discord deseni)
      if (!next && isDeafened.value) applyDeafen(false)
    } catch {
      // izin yoksa değiştirme
    }
  }

  // Kendini sağırlaştır: gelen tüm sesi sustur + mikrofonu kapat
  async function toggleDeafen() {
    // Seste değilken: yalnız varsayılan tercihi çevir
    if (!room) {
      setPreferDeafened(!preferDeafened.value)
      return
    }
    await applyDeafen(!isDeafened.value)
    setPreferDeafened(isDeafened.value)
  }

  // ── Cihaz seçimi (mikrofon/hoparlör) + çıkış sesi ──
  function micCaptureOpts(): { deviceId: string } | undefined {
    return inputDeviceId.value && inputDeviceId.value !== 'default'
      ? { deviceId: inputDeviceId.value }
      : undefined
  }
  function applySinkId(el: HTMLMediaElement) {
    const anyEl = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }
    if (typeof anyEl.setSinkId !== 'function') return
    anyEl.setSinkId(outputDeviceId.value === 'default' ? '' : outputDeviceId.value).catch(() => {})
  }
  async function setInputDevice(id: string) {
    inputDeviceId.value = id
    localStorage.setItem('kv.voice.inputDevice', id)
    // Canlı: bağlı + mikrofon açıksa cihazı anında değiştir
    if (room && canPublish.value && !isMuted.value) {
      try { await room.switchActiveDevice('audioinput', id) } catch { /* yoksay */ }
    }
  }
  function setOutputDevice(id: string) {
    outputDeviceId.value = id
    localStorage.setItem('kv.voice.outputDevice', id)
    for (const el of remoteAudioEls) applySinkId(el)
  }
  function setOutputVolume(v: number) {
    const vol = clampVol(v)
    outputVolume.value = vol
    localStorage.setItem('kv.voice.outputVolume', String(vol))
    for (const el of remoteAudioEls) el.volume = vol
  }

  async function applyDeafen(next: boolean) {
    isDeafened.value = next
    for (const el of remoteAudioEls) el.muted = next
    if (!room) return
    if (next) {
      // Sağırlaştır → mikrofonu kapat (önceki durumu hatırla)
      muteBeforeDeafen = isMuted.value
      if (canPublish.value && !isMuted.value) {
        try { await room.localParticipant.setMicrophoneEnabled(false); isMuted.value = true } catch { /* yoksay */ }
      }
    } else {
      // Sağırlığı kaldır → mikrofonu sağırlık öncesi haline getir
      if (canPublish.value && !muteBeforeDeafen && isMuted.value) {
        try { await room.localParticipant.setMicrophoneEnabled(true); isMuted.value = false } catch { /* yoksay */ }
      }
    }
  }

  // ── LiveKit Room olayları ─────────────────────────────────────────────────────
  function wireRoom(r: Room) {
    r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach() // <audio autoplay>
        el.style.display = 'none'
        el.muted = isDeafened.value // sağırsa yeni gelen sesi de sustur
        el.volume = outputVolume.value // çıkış sesi tercihi
        // Çıkış cihazı (hoparlör) tercihi — setSinkId destekleyen tarayıcılarda
        applySinkId(el)
        document.body.appendChild(el)
        remoteAudioEls.add(el)
      }
    })
    r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => {
        remoteAudioEls.delete(el)
        el.remove()
      })
    })
    // Konuşma algısı: per-participant IsSpeakingChanged (mute/unmute'a dayanıklı).
    // ActiveSpeakersChanged aggregate'ı mute/unmute döngüsünde kaçabiliyor; her
    // katılımcının isSpeaking'ini tarayıp seti yeniden kuruyoruz.
    r.on(RoomEvent.ActiveSpeakersChanged, recomputeSpeaking)
    // Odadaki canlı katılımcılar (bağlı kullanıcı için güvenilir kaynak)
    r.on(RoomEvent.ParticipantConnected, (p: Participant) => {
      attachSpeaking(p)
      refreshRoomParticipants()
    })
    r.on(RoomEvent.ParticipantDisconnected, () => {
      refreshRoomParticipants()
      recomputeSpeaking()
    })
    // Uzak katılımcı mikrofon aç/kapa göstergesi
    r.on(RoomEvent.TrackMuted, (_pub, p: Participant) => {
      const s = new Set(mutedUserIds.value); s.add(p.identity); mutedUserIds.value = s
    })
    r.on(RoomEvent.TrackUnmuted, (_pub, p: Participant) => {
      const s = new Set(mutedUserIds.value); s.delete(p.identity); mutedUserIds.value = s
    })
    r.on(RoomEvent.Disconnected, (reason?: unknown) => {
      // REV-7 teşhisi: kendiliğinden düşmenin NEDENİ konsola (DUPLICATE_IDENTITY,
      // SERVER_SHUTDOWN, ağ vb. — runtime'da görünür). Tekrar üreten kullanıcı paylaşır.
      console.warn('[voice] LiveKit Disconnected — reason:', reason)
      // Sunucu/ağ kaynaklı kopma → yerel durumu temizle (UI tutarlı kalsın)
      room = null
      resetLocalState()
    })
  }

  // REV-12: DM/grup çağrısında tek kişi (yalnız ben) kalınca ALONE_TIMEOUT_MS sonra otomatik bitir.
  // Biri katılırsa (length>1) sayaç iptal. Guild ses kanalında uygulanmaz (autoEndWhenAlone=false).
  watch(
    () => roomParticipants.value.length,
    (len) => {
      if (aloneTimer) { clearTimeout(aloneTimer); aloneTimer = null }
      if (!autoEndWhenAlone || !connectedChannelId.value) return
      if (len === 1) {
        aloneTimer = setTimeout(() => {
          if (autoEndWhenAlone && roomParticipants.value.length === 1) leave()
        }, ALONE_TIMEOUT_MS)
      }
    },
  )

  return {
    participantsByChannel,
    connectedChannelId,
    connecting,
    connectingChannelId,
    connectedAt,
    isMuted,
    canPublish,
    error,
    preferMuted,
    preferDeafened,
    inputDeviceId,
    outputDeviceId,
    outputVolume,
    setInputDevice,
    setOutputDevice,
    setOutputVolume,
    speakingUserIds,
    isDeafened,
    micError,
    roomParticipants,
    mutedUserIds,
    serverMutedUserIds,
    isConnectedTo,
    clearError,
    participantsFor,
    startedAtFor,
    loadParticipants,
    addParticipant,
    removeParticipant,
    addServerMute,
    removeServerMute,
    isServerMuted,
    join,
    leave,
    toggleMute,
    toggleDeafen,
  }
})

function toParticipant(p: VoiceParticipantDto): VoiceParticipant {
  return { userId: p.userId, username: p.username, avatarUrl: p.avatarUrl }
}

// Çıkış sesi 0–1 aralığına sıkıştır (geçersiz/NaN → 1).
function clampVol(v: number): number {
  if (!Number.isFinite(v)) return 1
  return Math.min(1, Math.max(0, v))
}
