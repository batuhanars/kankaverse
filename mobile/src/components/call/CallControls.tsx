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
}

/**
 * M4a-1 sözleşme §4 — alt kontrol çubuğu, yalnız ÜÇ düğme (kamera/ekran/roket YOK — §4 🔴).
 * Dokunma hedefleri D37 dersiyle ÖLÇÜLEREK: mikrofon/sohbet 56dp daire (≥44dp şartını rahatça
 * geçiyor), kapat düğmesi de 56dp (sözleşme "≥56dp" şartı).
 */
export function CallControls({ isMuted, canPublish, onToggleMute, onOpenChat, onHangUp }: Props) {
  return (
    <View style={styles.row}>
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
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
