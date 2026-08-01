import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import ColorPicker, { HueSlider, Panel1, Preview } from 'reanimated-color-picker';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Rol rengi seçici (M1e-B §3.3).
 *
 * 🔴 **Burada SERBEST HEX geçerli** — afiş rengindeki preset kısıtı role uygulanmıyor:
 * `CreateRoleDto.color` sunucuda `@Matches(/^#[0-9a-fA-F]{6}$/)` ile doğrulanıyor. Yani Discord'un
 * hex seçicisi bizde backend değişikliği olmadan yapılabiliyor.
 *
 * **Yeni bağımlılık (PM onaylı):** `reanimated-color-picker` — MIT; peer'ları (`reanimated`,
 * `gesture-handler`) zaten kurulu, native modül eklemiyor → Expo Go'da çalışır.
 * **Damlalık (eyedropper) konmadı:** ekran okuma izni ister, karşılığı yok.
 */
interface Props {
  visible: boolean;
  initialColor: string;
  onClose: () => void;
  onSelect: (hex: string) => void;
}

export function RoleColorSheet({ visible, initialColor, onClose, onSelect }: Props) {
  const bottomInset = useSheetInsets();
  // Seçim onaylanana kadar dışarı yazılmaz: kaydırırken her karede sunucuya/forma yazmak
  // gereksiz gürültü olurdu.
  const [picked, setPicked] = useState(initialColor);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text style={styles.title}>{t('guildSettings.roles.colorLabel')}</Text>
            <Pressable onPress={() => onSelect(picked)} hitSlop={10}>
              <Text style={styles.save}>{t('common.save')}</Text>
            </Pressable>
          </View>

          <View style={styles.content}>
            <ColorPicker
              value={initialColor}
              // Kütüphane rgba/hex verebiliyor; sunucu #RRGGBB istiyor, hex'in ilk 7 karakteri
              // alınıyor (alfa varsa atılır — sunucu 6 haneli desen dışını reddeder).
              onComplete={({ hex }) => setPicked(hex.slice(0, 7))}
              style={styles.picker}
            >
              <Preview hideInitialColor style={styles.preview} />
              <Panel1 style={styles.panel} />
              <HueSlider style={styles.hue} />
            </ColorPicker>

            <Text style={styles.hint}>{t('guildSettings.roles.colorHint')}</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 8,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  save: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
    gap: 12,
  },
  picker: { gap: 12 },
  preview: { height: 40, borderRadius: theme.radius.md },
  panel: { height: 200, borderRadius: theme.radius.md },
  hue: { borderRadius: 999 },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
  },
});
