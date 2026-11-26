import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuickReactions } from '@/utils/quickReactions';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** Şeridin yüksekliği: konumlandırma (mesajın üstü/altı) bunu kullanır. */
export const STRIP_HEIGHT = 52;

interface Props {
  /** Şeridin üst kenarı (ekran kabına göre). */
  top: number;
  /** Bu mesaja verdiğim tepkiler (vurgulu). */
  myEmojis: string[];
  onPick: (emoji: string) => void;
  /** Tam emoji listesi (orada "Varsayılan tepkiler" bölümü ve Düzenle var). */
  onOpenPicker: () => void;
}

/**
 * C81 — seçili TEK mesajın üstünde süzülen hızlı tepki şeridi (WhatsApp gibi). Hızlı tepkileri düzenleme
 * kalemi burada YOK: düzenleme tam emoji listesinin içindeki "Varsayılan tepkiler" bölümünde (sahip isteği).
 */
export function QuickReactionStrip({ top, myEmojis, onPick, onOpenPicker }: Props) {
  const quickEmojis = useQuickReactions();
  // Rev.2: şerit birden belirmesin, kısa bir büyüyerek açılma (WhatsApp hissi).
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [appear]);
  const scale = appear.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  return (
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <Animated.View style={[styles.pill, { opacity: appear, transform: [{ scale }] }]}>
        {quickEmojis.map((emoji) => {
          const mine = myEmojis.includes(emoji);
          return (
            <Pressable
              key={emoji}
              onPress={() => onPick(emoji)}
              style={[styles.button, mine && styles.buttonActive]}
              accessibilityRole="button"
              accessibilityLabel={emoji}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          );
        })}
        {/* Tam liste girişi: gri outline yüz (artı "ekle" der, yüz "emoji seç" der). */}
        <Pressable
          onPress={onOpenPicker}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={t('message.emojiButton')}
        >
          <Ionicons name="add" size={24} color={theme.colors.textSecondary} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // Gölge yok (tasarım kuralı): katman ayrımı yükseltilmiş zemin + ince kenarlıkla.
  pill: {
    height: STRIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    borderRadius: STRIP_HEIGHT / 2,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  button: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  buttonActive: { backgroundColor: theme.colors.accentSubtle },
  emoji: { fontSize: 26 },
});
