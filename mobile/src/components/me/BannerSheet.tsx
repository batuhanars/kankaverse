import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BANNER_PRESET_KEYS, bannerColors } from '@/utils/bannerColor';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Afiş paneli (sahip talebi 2026-08-01, Discord "Profil Afişi" panelinin karşılığı): iki seçenek —
 * **Afiş Rengi** ve **Afiş Ekle**.
 *
 * 🔴 **Serbest hex YOK, preset var.** Sahip hex kodlu bir renk seçici istemişti; sunucu `bannerColor`
 * alanını **allowlist** ile doğruluyor (`banner-presets.ts`: cream · pink · red · orange · yellow ·
 * purple · blue · teal · green · dark) ve dışındakini "Geçersiz afiş rengi." diye reddediyor.
 * Serbest hex için sunucu değişikliği gerekir ve web'den de ayrışırdı — bu yüzden panel, web'in
 * Ayarlar ekranındaki **aynı 10 swatch'ı** gösteriyor. Karar sahibe bildirildi.
 *
 * "Varsayılan" seçeneği `null` gönderir → marka gradyanına döner (web `banner.default`).
 */
interface Props {
  visible: boolean;
  currentColor: string | null;
  onClose: () => void;
  onPickColor: (key: string | null) => void;
  onPickImage: () => void;
}

export function BannerSheet({ visible, currentColor, onClose, onPickColor, onPickImage }: Props) {
  const bottomInset = useSheetInsets();
  // Panel iki adımlı: kök liste → renk seçimi. Ayrı modal açmak yerine aynı panelde derinleşiyor
  // (iç içe modal Android'de güvenilmez, mesaj panelinde de bu yol seçildi).
  const [colorStep, setColorStep] = useState(false);

  function close() {
    setColorStep(false);
    onClose();
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />

          <View style={styles.content}>
            <Text style={styles.title}>{t('settings.bannerImage.label')}</Text>

            {!colorStep ? (
              <View style={styles.group}>
                <Pressable style={styles.option} onPress={() => setColorStep(true)}>
                  <Text style={styles.optionText}>{t('settings.banner.label')}</Text>
                  <View style={styles.currentSwatchWrap}>
                    <LinearGradient
                      colors={bannerColors(currentColor)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.currentSwatch}
                    />
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </View>
                </Pressable>
                <Pressable style={styles.option} onPress={onPickImage}>
                  <Text style={styles.optionText}>{t('settings.bannerImage.upload')}</Text>
                  <Ionicons name="image-outline" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <>
                <ScrollView contentContainerStyle={styles.swatches}>
                  <Pressable
                    onPress={() => onPickColor(null)}
                    style={[styles.swatchWrap, !currentColor && styles.swatchWrapActive]}
                  >
                    <LinearGradient
                      colors={bannerColors(null)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.swatch}
                    />
                    <Text style={styles.swatchLabel} numberOfLines={1}>
                      {t('settings.banner.default')}
                    </Text>
                  </Pressable>

                  {BANNER_PRESET_KEYS.map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => onPickColor(key)}
                      style={[styles.swatchWrap, currentColor === key && styles.swatchWrapActive]}
                    >
                      <LinearGradient
                        colors={bannerColors(key)}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.swatch}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.hint}>{t('settings.banner.hint')}</Text>
              </>
            )}
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
    maxHeight: '80%',
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
  content: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
    gap: 12,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  optionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '500',
  },
  currentSwatchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currentSwatch: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.sm,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatchWrap: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  swatchWrapActive: {
    borderColor: theme.colors.accent500,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  swatchLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
    maxWidth: 54,
    textAlign: 'center',
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
  },
});
