import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  isMuted: boolean;
  /** Karantina (`canPublish=false`) — düğme görünür ama pasif (§2). */
  canPublish: boolean;
  onToggleMute: () => void;
  /**
   * PM takibi (2026-08-07, M4c) — opsiyonel: `undefined` iken düğme HİÇ ÇİZİLMEZ. Guild ses
   * kanalının kendi metin akışı yok, "Sohbet" etiketiyle minimize'ın aynısını yapan bir düğme
   * yanlış vaat veriyordu (boş yüzey sınıfı). DM araması bu prop'u her zaman geçer, davranış
   * DEĞİŞMEDİ — yalnız guild çağıran taraf artık hiç geçmiyor.
   */
  onOpenChat?: () => void;
  onHangUp: () => void;
  /**
   * M4d §5/§7 — yalnız `onToggleCamera` de dolu VE bu true iken kamera düğmesi çizilir. Çağıran
   * taraf (`call.tsx`) bunu `(callKind==='dm' || callKind==='group') && canPublishCamera` ile besler
   * (M4e §4); guild kamerası kapsam dışı (M4f) — orada düğme hiç görünmez. T&S §7: "görünür-kilitli
   * yap" ilkesinin bilinçli
   * istisnası, `canPublishCamera=false` sessizce hiç çizilmeyerek uygulanır.
   */
  canPublishCamera?: boolean;
  isCameraOn?: boolean;
  onToggleCamera?: () => void;
  /** §4 — yalnız kamera AÇIKKEN çizilir (boş yüzey açma kuralı); kamera kapalıyken bu prop dolu
   *  gelse bile düğme çizilmez (`isCameraOn` de kontrol edilir). */
  onSwitchCamera?: () => void;
}

/**
 * M4a-1 sözleşme §4 — alt kontrol çubuğu. M4d ile beşe çıkabiliyor: mikrofon · kamera ·
 * kamera çevir (yalnız kamera açıkken) · sohbet · kapat (§5). Dokunma hedefleri D37 dersiyle
 * ÖLÇÜLEREK sabit 56dp daire — beşe çıkınca KÜÇÜLTÜLMEZ, aralık daralır (§5 🔴).
 */
export function CallControls({
  isMuted,
  canPublish,
  onToggleMute,
  onOpenChat,
  onHangUp,
  canPublishCamera,
  isCameraOn,
  onToggleCamera,
  onSwitchCamera,
}: Props) {
  const showCamera = !!canPublishCamera && !!onToggleCamera;
  const showFlip = showCamera && !!isCameraOn && !!onSwitchCamera;
  // §5 🔴 D37 dersi — beş düğme (56dp + 24dp aralık) dar Android ekranlarında (~360dp) taşıyor;
  // düğme küçültülmez, aralık daraltılır (12dp — 56dp dairelerin kendisi zaten bol dokunma payı
  // veriyor, aradaki boşluğun daralması dokunma hedefini küçültmez).
  const buttonCount = 2 + (onOpenChat ? 1 : 0) + (showCamera ? 1 : 0) + (showFlip ? 1 : 0);
  const gap = buttonCount >= 5 ? 12 : 24;

  return (
    <View style={[styles.row, { gap }]}>
      <Pressable
        onPress={onToggleMute}
        disabled={!canPublish}
        style={[styles.circle, isMuted && styles.circleActive, !canPublish && styles.circleDisabled]}
        accessibilityRole="button"
        accessibilityLabel={isMuted ? t('voice.unmute') : t('voice.mute')}
      >
        <Ionicons
          name={isMuted ? 'mic-off' : 'mic'}
          size={24}
          color={canPublish ? theme.colors.textPrimary : theme.colors.textMuted}
        />
      </Pressable>

      {showCamera && (
        <Pressable
          onPress={onToggleCamera}
          style={[styles.circle, isCameraOn && styles.circleActive]}
          accessibilityRole="button"
          accessibilityLabel={isCameraOn ? t('voice.cameraOff') : t('voice.cameraOn')}
        >
          <Ionicons name={isCameraOn ? 'videocam' : 'videocam-off'} size={22} color={theme.colors.textPrimary} />
        </Pressable>
      )}

      {showFlip && (
        <Pressable
          onPress={onSwitchCamera}
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.call.flipCamera')}
        >
          <Ionicons name="camera-reverse-outline" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      )}

      {onOpenChat && (
        <Pressable
          onPress={onOpenChat}
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.call.chatAction')}
        >
          <Ionicons name="chatbubble" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      )}

      <Pressable
        onPress={onHangUp}
        style={[styles.circle, styles.hangUp]}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.call.endCall')}
      >
        {/* PM incelemesi (2026-08-06) — tasarım referansı (görsel 11) kapatmayı ters ahize ile
            gösteriyor; `close` (X) "ekranı kapat" anlamına gelir ama bu düğme ARAMAYI BİTİRİR.
            Ionicons'ta ayrı bir "hang up" glifi yok — telefon ikonu klasik ahize-hattı-inkar
            görünümü için 135° döndürülüyor (yaygın kalıp; kırmızı zemin zaten "bitir" anlamını
            pekiştiriyor). */}
        <Ionicons
          name="call"
          size={26}
          color={theme.colors.textPrimary}
          style={styles.hangUpIcon}
        />
      </Pressable>
    </View>
  );
}

const CIRCLE = 56;

const styles = StyleSheet.create({
  row: {
    // §5 — `gap` burada YOK: buton sayısına göre bileşen gövdesinde hesaplanıp inline uygulanıyor.
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: {
    backgroundColor: theme.colors.borderStrong,
  },
  circleDisabled: {
    opacity: 0.5,
  },
  hangUp: {
    backgroundColor: theme.colors.danger,
  },
  hangUpIcon: {
    transform: [{ rotate: '135deg' }],
  },
});
