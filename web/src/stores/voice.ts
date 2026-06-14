import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  Room,
  RoomEvent,
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
  const isMuted = ref(false)
  const canPublish = ref(false)
  const error = ref('')
  // ActiveSpeakers (yalnız bağlı oda) — userId seti
  const speakingUserIds = ref<Set<string>>(new Set())

  // LiveKit Room — reaktif değil (kompleks nesne)
  let room: Room | null = null

  function isConnectedTo(channelId: string): boolean {
    return connectedChannelId.value === channelId
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

      if (data.canPublish) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true)
          isMuted.value = false
        } catch {
          // Mikrofon izni reddi → dinleyici kal, sustur durumunda göster
          isMuted.value = true
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
    }
  }

  async function leave() {
    if (room) {
      try { await room.disconnect() } catch { /* yoksay */ }
      room = null
    }
    connectedChannelId.value = null
    isMuted.value = false
    canPublish.value = false
    speakingUserIds.value = new Set()
  }

  async function toggleMute() {
    if (!room || !canPublish.value) return
    const next = !isMuted.value
    try {
      await room.localParticipant.setMicrophoneEnabled(!next)
      isMuted.value = next
    } catch {
      // izin yoksa değiştirme
    }
  }

  // ── LiveKit Room olayları ─────────────────────────────────────────────────────
  function wireRoom(r: Room) {
    r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach() // <audio autoplay>
        el.style.display = 'none'
        document.body.appendChild(el)
      }
    })
    r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove())
    })
    r.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      speakingUserIds.value = new Set(speakers.map((s) => s.identity))
    })
    r.on(RoomEvent.Disconnected, () => {
      // Sunucu/ağ kaynaklı kopma → yerel durumu temizle (UI tutarlı kalsın)
      connectedChannelId.value = null
      isMuted.value = false
      canPublish.value = false
      speakingUserIds.value = new Set()
      room = null
    })
    // Not: katılımcı listesi (panel) backend WS'inden beslenir; client room event'i
    // güven kaynağı değil (sözleşme §5). Burada yalnız ses + konuşan göstergesi.
  }

  return {
    participantsByChannel,
    connectedChannelId,
    connecting,
    isMuted,
    canPublish,
    error,
    speakingUserIds,
    isConnectedTo,
    participantsFor,
    loadParticipants,
    addParticipant,
    removeParticipant,
    join,
    leave,
    toggleMute,
  }
})

function toParticipant(p: VoiceParticipantDto): VoiceParticipant {
  return { userId: p.userId, username: p.username, avatarUrl: p.avatarUrl }
}
