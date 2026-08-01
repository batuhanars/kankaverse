import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Rol rengi seçici (M1e-B §3.3): **hazır swatch'lar + serbest hex girişi.**
 *
 * 🔴 **`reanimated-color-picker` KALDIRILDI (sahip bulgusu 2026-08-01: uygulama renk seçerken
 * çöküyordu).** Kök sebep sürüm uyumsuzluğu: kütüphane `Animated.addWhitelistedNativeProps`
 * çağırıyor, bu API **Reanimated 4'te kaldırıldı** (bizde ~4.1.1 kurulu). Paketin peer bildirimi
 * `reanimated >=2.0.0` diyor ama gerçek durum bu değil — **peer bildirimi uyumluluk kanıtı değildir.**
 *
 * Yerine sürükleme jesti gerektirmeyen bir seçici kondu: bağımlılık yok, worklet yok, çökme sınıfı
 * tamamen ortadan kalktı. **Web zaten böyle yapıyor** (`RolesSettingsSection.vue`: swatch ızgarası +
 * "Özel (hex)" girişi), yani bu aynı zamanda parite: renkler web'deki `COLOR_PRESETS` ile birebir.
 *
 * Serbest hex kaybolmadı — sunucu `#RRGGBB` kabul ediyor, giriş alanı onu veriyor.
 */
interface Props {
  visible: boolean;
  initialColor: string;
  onClose: () => void;
  onSelect: (hex: string) => void;
}

/** `web/src/views/app/components/RolesSettingsSection.vue` `COLOR_PRESETS` ile BİREBİR. */
const COLOR_PRESETS = [
  '#99aab5',
  '#1abc9c',
  '#2ecc71',
  '#3498db',
  '#9b59b6',
  '#e91e63',
  '#f1c40f',
  '#e67e22',
  '#e74c3c',
  '#ff6b3d',
];

/** Sunucunun deseniyle aynı (`CreateRoleDto.color`) — istemci kendi kuralını uydurmuyor. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function RoleColorSheet({ visible, initialColor, onClose, onSelect }: Props) {
  const bottomInset = useSheetInsets();
  const [draft, setDraft] = useState(initialColor);

  // Panel her açılışta mevcut renkle başlar (önceki oturumun yarım seçimi taşınmasın).
  useEffect(() => {
    if (visible) setDraft(initialColor);
  }, [visible, initialColor]);

  const valid = HEX_RE.test(draft);

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
            <Pressable onPress={() => valid && onSelect(draft.toLowerCase())} hitSlop={10} disabled={!valid}>
              <Text style={[styles.save, !valid && styles.saveDisabled]}>{t('common.save')}</Text>
            </Pressable>
          </View>

          <View style={styles.content}>
            <View style={[styles.preview, { backgroundColor: valid ? draft : theme.colors.bgElevated }]} />

            <View style={styles.swatches}>
              {COLOR_PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => setDraft(preset)}
                  style={[
                    styles.swatchWrap,
                    draft.toLowerCase() === preset && styles.swatchWrapActive,
                  ]}
                >
                  <View style={[styles.swatch, { backgroundColor: preset }]} />
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>{t('guildSettings.roles.colorCustomLabel')}</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('guildSettings.roles.colorPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={7}
            />
            {/* Geçersiz hex'te Kaydet pasif + sebep yazılı: sunucuya gönderip 400 almak yerine
                kullanıcıya burada söylenir (kanal adı normalize deseninin kardeşi). */}
            {!valid ? <Text style={styles.invalid}>{t('guildSettings.roles.colorInvalid')}</Text> : null}

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
  saveDisabled: { color: theme.colors.textMuted },
  content: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
    gap: 10,
  },
  preview: {
    height: 44,
    borderRadius: theme.radius.md,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatchWrap: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchWrapActive: { borderColor: theme.colors.textPrimary },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginTop: 4,
  },
  input: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    paddingHorizontal: 12,
  },
  invalid: { color: theme.colors.danger, fontSize: theme.fontSize.xs },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
  },
});
