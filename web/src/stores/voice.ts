import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  Room,
  RoomEvent,
  ParticipantEvent,
  Track,
  type RemoteTrack,
  type Participant,
} from 'livekit-client'
import { voiceApi, type VoiceParticipantDto } from '@/api/voice'

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
  const isMuted = ref(false)
  const canPublish = ref(false)
  const error = ref('')
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

  // ── Panel listesi (WS + ilk yük) ────────────────────────────────────────────
  async function loadParticipants(channelId: string) {
    try {
      const res = await voiceApi.getParticipants(channelId)
      participantsByChannel.value[channelId] = res.data.map(toParticipant)
    } catch {
      participantsByChannel.value[channelId] = []
    }
  }

  function addParticipant(channelId: string, p: VoiceParticipant) {
    const list = participantsByChannel.value[channelId] ?? []
    if (!list.some((x) => x.userId === p.userId)) {
      participantsByChannel.value[channelId] = [...list, p]
    }
  }

  function removeParticipant(channelId: string, userId: string) {
    const list = participantsByChannel.value[channelId]
    if (list) {
      participantsByChannel.value[channelId] = list.filter((x) => x.userId !== userId)
    }
  }

  // ── Yerel bağlantı ──────────────────────────────────────────────────────────
  async function join(channelId: string) {
    if (connectedChannelId.value === channelId || connecting.value) return
    if (room) await leave()

    connecting.value = true
    connectingChannelId.value = channelId
    error.value = ''
    try {
      const { data } = await voiceApi.getToken(channelId)
      canPublish.value = data.canPublish

      room = new Room()
      wireRoom(room)
      await room.connect(data.url, data.token)
      // Tarayıcı autoplay kilidini katılım jesti açar; yine de garantiye al
      try { await room.startAudio() } catch { /* jest gerektirebilir; ses ilk etkileşimde açılır */ }

      connectedChannelId.value = channelId
      refreshRoomParticipants()
      // Konuşma dinleyicilerini bağla (yerel + mevcut uzaklar)
      attachSpeaking(room.localParticipant)
      for (const p of room.remoteParticipants.values()) attachSpeaking(p)

      if (data.canPublish) {
        try {
          // getUserMedia yalnız güvenli bağlamda (localhost/HTTPS) var; yoksa Firefox hiç sormaz
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('insecure')
          await room.localParticipant.setMicrophoneEnabled(true)
          isMuted.value = false
          micError.value = ''
        } catch (e) {
          // Mikrofon açılamadı → dinleyici kal + NEDENİ görünür yap (sessiz yutma yok)
          isMuted.value = true
          micError.value = !window.isSecureContext || (e as Error)?.message === 'insecure' ? 'insecure' : 'denied'
        }
      } else {
        // Karantina: dinleyici modu
        isMuted.value = true
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      error.value = err.response?.data?.message ?? 'Ses kanalına bağlanılamadı.'
      await leave()
    } finally {
      connecting.value = false
      connectingChannelId.value = null
    }
  }

  async function leave() {
    if (room) {
      try { await room.disconnect() } catch { /* yoksay */ }
      room = null
    }
    resetLocalState()
  }

  function resetLocalState() {
    connectedChannelId.value = null
    isMuted.value = false
    canPublish.value = false
    isDeafened.value = false
    micError.value = ''
    speakingUserIds.value = new Set()
    roomParticipants.value = []
    mutedUserIds.value = new Set()
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

  async function toggleMute() {
    if (!room || !canPublish.value) return
    const next = !isMuted.value
    try {
      await room.localParticipant.setMicrophoneEnabled(!next)
      isMuted.value = next
      // Sağırken mikrofonu açmak sağırlığı da kaldırır (Discord deseni)
      if (!next && isDeafened.value) applyDeafen(false)
    } catch {
      // izin yoksa değiştirme
    }
  }

  // Kendini sağırlaştır: gelen tüm sesi sustur + mikrofonu kapat
  async function toggleDeafen() {
    if (!room) return
    await applyDeafen(!isDeafened.value)
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

  return {
    participantsByChannel,
    connectedChannelId,
    connecting,
    connectingChannelId,
    isMuted,
    canPublish,
    error,
    speakingUserIds,
    isDeafened,
    micError,
    roomParticipants,
    mutedUserIds,
    isConnectedTo,
    clearError,
    participantsFor,
    loadParticipants,
    addParticipant,
    removeParticipant,
    join,
    leave,
    toggleMute,
    toggleDeafen,
  }
})

function toParticipant(p: VoiceParticipantDto): VoiceParticipant {
  return { userId: p.userId, username: p.username, avatarUrl: p.avatarUrl }
}
