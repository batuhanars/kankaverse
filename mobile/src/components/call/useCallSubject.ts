import type { TrackPublication } from 'livekit-client';
import { useVoiceStore } from '@/stores/voice';
import { useDmStore } from '@/stores/dm';

export interface CallSubject {
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  /** Yalnız `.track` dolu olduğunda gerçek video vardır (bkz. `ParticipantTile` notu). */
  videoPublication: TrackPublication | null;
  isScreenShare: boolean;
}

/**
 * "Arama küçültülmüşken kimi/neyi gösteriyoruz" sorusunun TEK cevabı.
 *
 * Kural M4p sözleşme §3 + §3.6 addendum'undan geliyor ve buraya `CallPipOverlay`den TAŞINDI
 * (kopyalanmadı):
 *  1. Odada ekran paylaşımı varsa konu her zaman paylaşılan ekrandır — DM/grup ayrımından ÖNCE
 *     gelir. Odak seçimi yok, ilki alınır (`call.tsx`teki "ilk paylaşıma düşer" yedeğiyle aynı).
 *  2. 1-1 DM: karşı taraf. Henüz odaya düşmediyse `dm` store'daki kanaldan ad/avatar yedeği.
 *  3. Grup DM / ortam kanalı: konuşan kişi, kimse konuşmuyorsa ilk uzak katılımcı.
 *
 * Kendi görüntün hiçbir dalda YOK: küçültülmüş pencerede kullanıcıya kendi kamerasını göstermek
 * bilgi vermez, merak ettiği karşı tarafın orada olup olmadığıdır.
 *
 * 🔴 Neden ortak kanca (sahip bulgusu 2026-08-12): mini pencere (`MiniCallWindow`) bugüne kadar
 * yalnız avatar çiziyordu — karşı taraf kamerasını veya ekranını paylaşırken bile. Aynı seçimi
 * orada ikinci kez yazmak, iki pencerenin zamanla ayrışması demekti (PiP ekran paylaşımını
 * kapsıyor, mini pencere kapsamıyor gibi). Rule of Three beklenmedi: bu ikinci bir kural değil,
 * AYNI kuralın ikinci tüketicisi (`responseGate.ts`teki aynı gerekçe).
 */
export function useCallSubject(): CallSubject | null {
  const connectedChannelId = useVoiceStore((s) => s.connectedChannelId);
  const callKind = useVoiceStore((s) => s.callKind);
  const roomParticipants = useVoiceStore((s) => s.roomParticipants);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);
  const remoteCameraPublications = useVoiceStore((s) => s.remoteCameraPublications);
  const remoteScreenPublications = useVoiceStore((s) => s.remoteScreenPublications);
  const channel = useDmStore((s) => s.channels.find((c) => c.id === connectedChannelId));

  if (!connectedChannelId) return null;

  const remoteMembers = roomParticipants.filter((p) => !p.isLocal);

  const screenSharerId = Object.keys(remoteScreenPublications)[0] ?? null;
  if (screenSharerId) {
    const sharer = remoteMembers.find((p) => p.userId === screenSharerId);
    return {
      userId: screenSharerId,
      name: sharer?.username ?? '',
      avatarUrl: sharer?.avatarUrl ?? null,
      videoPublication: remoteScreenPublications[screenSharerId] ?? null,
      isScreenShare: true,
    };
  }

  if (callKind === 'dm') {
    const peerFallback = channel?.type === 'DM' ? channel.otherUser : null;
    const peerMember = remoteMembers[0];
    const name = peerMember?.username ?? peerFallback?.username ?? '';
    if (!name) return null;
    return {
      userId: peerMember?.userId ?? peerFallback?.id ?? null,
      name,
      avatarUrl: peerMember?.avatarUrl ?? peerFallback?.avatarUrl ?? null,
      videoPublication: peerMember ? (remoteCameraPublications[peerMember.userId] ?? null) : null,
      isScreenShare: false,
    };
  }

  const speaker = remoteMembers.find((p) => speakingUserIds.has(p.userId)) ?? remoteMembers[0];
  if (!speaker) return null;
  return {
    userId: speaker.userId,
    name: speaker.username,
    avatarUrl: speaker.avatarUrl,
    videoPublication: remoteCameraPublications[speaker.userId] ?? null,
    isScreenShare: false,
  };
}
