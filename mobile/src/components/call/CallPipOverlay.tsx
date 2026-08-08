import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVoiceStore } from '@/stores/voice';
import { useDmStore } from '@/stores/dm';
import { addPipModeChangeListener } from '@modules/picture-in-picture';
import { ParticipantTile } from '@/components/call/ParticipantTile';
import { theme } from '@/theme';

/**
 * M4p sözleşme §2/§3 — sistem PiP penceresinin içeriği. `MiniCallWindow` ile AYNI desende (kök
 * `_layout.tsx`'te tek yerde mount edilen, aramada değilken/PiP'te değilken `null` dönen mutlak
 * konumlu bileşen) ama farklı amaç: `MiniCallWindow` uygulama İÇİNDE küçük bir "aramaya dön"
 * balonu, bu ise Android'in GERÇEK sistem PiP penceresine giren görüntü.
 *
 * 🔴 Neden `/call` ekranının kendisi değil, ayrı ve GLOBAL bir bileşen — Android PiP, arka plana
 * alma ANINDA ekranda ne varsa ONU küçültür (sistemin kendi ekran görüntüsü, özel bir "PiP ekranı"
 * kavramı yok). Kullanıcı `/call`dan başka bir ekrandayken (`MiniCallWindow`la aramaya dönmeden,
 * ör. DM listesinde gezinirken) PiP'e girerse, `/call` hiç mount değildir — içerik orada olsaydı
 * PiP boş/yanlış bir pencere gösterirdi. Bu bileşen KÖKTE mount olduğu için hangi ekran açık olursa
 * olsun aynı kompakt görünümü TAM EKRAN kaplayıp altındaki her şeyi (chrome dahil) gizliyor —
 * PiP'in gördüğü tek şey bu.
 *
 * §3 — içerik: 1-1 DM'de karşı taraf, grup DM/ortam kanalında KONUŞAN kişi (kimse konuşmuyorsa ilk
 * uzak katılımcı). Kendi görüntün hiçbir dalda YOK. Kontrol/metin/ızgara yok — `ParticipantTile`in
 * `'pip'` varyantı zaten bunu garanti ediyor (bkz. o bileşendeki yorum).
 */
export function CallPipOverlay() {
  const connectedChannelId = useVoiceStore((s) => s.connectedChannelId);
  const callKind = useVoiceStore((s) => s.callKind);
  const roomParticipants = useVoiceStore((s) => s.roomParticipants);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);
  const remoteCameraPublications = useVoiceStore((s) => s.remoteCameraPublications);
  const channel = useDmStore((s) => s.channels.find((c) => c.id === connectedChannelId));

  const [isInPip, setIsInPip] = useState(false);
  useEffect(() => {
    const sub = addPipModeChangeListener(({ isInPip: next }) => setIsInPip(next));
    return () => sub.remove();
  }, []);

  if (!isInPip || !connectedChannelId) return null;

  const remoteMembers = roomParticipants.filter((p) => !p.isLocal);
  let subject: { name: string; avatarUrl: string | null; videoPublication: (typeof remoteCameraPublications)[string] | null } | null =
    null;

  if (callKind === 'dm') {
    // §3 "1-1 DM: karşı tarafın videosu; kamerası kapalıysa avatarı" — `MiniCallWindow`daki AYNI
    // katılmadan-önce yedeği (`channel.otherUser`), henüz odaya düşmemiş karşı tarafı da kapsar.
    const peerFallback = channel?.type === 'DM' ? channel.otherUser : null;
    const peerMember = remoteMembers[0];
    const name = peerMember?.username ?? peerFallback?.username ?? '';
    if (name) {
      subject = {
        name,
        avatarUrl: peerMember?.avatarUrl ?? peerFallback?.avatarUrl ?? null,
        videoPublication: peerMember ? (remoteCameraPublications[peerMember.userId] ?? null) : null,
      };
    }
  } else {
    // §3 "Grup DM / ortam kanalı: konuşan kişi. Kimse konuşmuyorsa ilk uzak katılımcı."
    const speaker = remoteMembers.find((p) => speakingUserIds.has(p.userId)) ?? remoteMembers[0];
    if (speaker) {
      subject = {
        name: speaker.username,
        avatarUrl: speaker.avatarUrl,
        videoPublication: remoteCameraPublications[speaker.userId] ?? null,
      };
    }
  }

  return (
    <View style={styles.root}>
      {subject && (
        <ParticipantTile
          variant="pip"
          name={subject.name}
          avatarUrl={subject.avatarUrl}
          speaking={false}
          micOff={false}
          videoPublication={subject.videoPublication}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.bgContent,
    // `MiniCallWindow`nun (zIndex 50) ÜSTÜNDE — PiP anında ekranda o balon da açık olabilir,
    // TAMAMEN gizlenmesi gerekiyor (sözleşme §3: "ızgara yok, kontrol yok" — balon da bir kontrol).
    zIndex: 100,
    elevation: 16,
  },
});
