import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

export interface ProfileStripAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

interface Props {
  actions: ProfileStripAction[];
  disabled?: boolean;
}

/**
 * Sprint M3b R3 §3.3 — kimlik kartının içindeki **ikon şeridi** (ikon üstte, küçük etiket altta).
 * Bugün taşıdığı aksiyonlar: **Mesaj** · **Kanka Ekle**.
 *
 * 🔴 **M4 uyumu (sözleşme §3.2.1 şartı): 2-4 öğeyi yeniden tasarım gerektirmeden alır.** Sabit
 * sütun sayısı YOK, yüzde genişlik YOK: her öğe `flex: 1`, yani şerit kaç öğe gelirse alanı ona
 * eşit böler (2 öğede yarı yarıya, 4 öğede dörde bir). Sesli Arama + Görüntülü Arama M4'te
 * `actions` dizisine iki eleman eklenerek girer, bu dosya değişmez.
 * Etiketler `numberOfLines={1}` + `adjustsFontSizeToFit`: dar sütunda kırpılmak yerine küçülür.
 *
 * 🔴 Şerit BOŞSA çağıran hiç render etmez (boş yüzey açma kuralı) — bileşen de savunmacı olarak
 * `null` döner.
 *
 * 🔴 Yıkıcı aksiyonlar (Kankalıktan Çıkar · Engelle · Engeli Kaldır) buraya GİRMEZ: küçük ikonla
 * yanlış basmaya açık. Onlar afişin sağ üstündeki ⋯ menüsünde (sahip kararı, Discord birebir).
 */
export function ProfileActionStrip({ actions, disabled }: Props) {
  if (actions.length === 0) return null;

  return (
    <View style={styles.strip}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={action.onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={[styles.item, disabled && styles.itemDisabled]}
        >
          <Ionicons name={action.icon} size={20} color={theme.colors.textPrimary} />
          <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: 8,
  },
  item: {
    // 🔴 `flex: 1` — öğe sayısı değişince yerleşim kendini ayarlar (bkz. dosya başı M4 notu).
    flex: 1,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  itemDisabled: {
    opacity: 0.5,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
});
