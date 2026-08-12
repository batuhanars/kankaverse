import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVoiceStore } from '@/stores/voice';
import { addPipModeChangeListener } from '@modules/picture-in-picture';
import { ParticipantTile } from '@/components/call/ParticipantTile';
import { useCallSubject } from '@/components/call/useCallSubject';
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
 * §3 içeriği (kimin gösterileceği) ARTIK `useCallSubject`te: aynı kuralı mini pencere de tüketiyor,
 * iki yerde ayrı ayrı yaşarsa zamanla ayrışırlar (bkz. o dosyadaki not). Kural değişmedi, taşındı.
 * Kontrol/metin/ızgara yok — `ParticipantTile`in `'pip'` varyantı zaten bunu garanti ediyor.
 */
export function CallPipOverlay() {
  const connectedChannelId = useVoiceStore((s) => s.connectedChannelId);
  const subject = useCallSubject();

  const [isInPip, setIsInPip] = useState(false);
  useEffect(() => {
    const sub = addPipModeChangeListener(({ isInPip: next }) => setIsInPip(next));
    return () => sub.remove();
  }, []);

  if (!isInPip || !connectedChannelId) return null;

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
          isScreenShare={subject.isScreenShare}
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
