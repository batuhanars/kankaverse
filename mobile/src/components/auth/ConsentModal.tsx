import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { t } from '@/i18n';
import { theme } from '@/theme';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://kankaverse.com';

interface Props {
  visible: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Sprint M1c contract §3.2 — 🔴 R7 odağı: rıza adımı ZORUNLU ve ATLANAMAZ. Web `RegisterView.vue`
// deseninin birebir taşınmışı: kayıt butonu doğrudan kaydetmez, bu modal açılır; asıl `register()`
// çağrısı YALNIZ "Okudum, kabul ediyorum" ile tetiklenir (register.tsx `confirmRegister`).
// Metinler web'in MEVCUT `legal.*` anahtarlarından — mobil için kısaltılmış/yeni Türkçe metin YOK.
// Onay kutucuğu formun içine gömülü bir checkbox DEĞİL — karar anında ayrı bir yüzey (bu modal).
export function ConsentModal({ visible, loading, onCancel, onConfirm }: Props) {
  const [linkError, setLinkError] = useState<string | null>(null);

  async function openLegalLink(path: string) {
    setLinkError(null);
    const url = `${WEB_URL}${path}`;
    try {
      await Linking.openURL(url);
    } catch {
      // contract §4/4 — açılamazsa kullanıcı bilgilendirilir, sessizce yutulmaz.
      setLinkError(t('mobile.register.linkOpenError'));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('legal.consentTitle')}</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.paragraph}>{t('legal.consentEncryption')}</Text>
            <Text style={styles.paragraph}>{t('legal.consentModeration')}</Text>
            <Text style={styles.paragraphMuted}>
              {t('legal.consentAgreePre')}{' '}
              <Text style={styles.link} onPress={() => openLegalLink('/kurallar')}>
                {t('legal.rules.linkLabel')}
              </Text>{' '}
              {t('legal.and')}{' '}
              <Text style={styles.link} onPress={() => openLegalLink('/gizlilik')}>
                {t('legal.privacy.linkLabel')}
              </Text>{' '}
              {t('legal.consentAgreePost')}
            </Text>
            {linkError ? <Text style={styles.linkError}>{linkError}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable disabled={loading} onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              disabled={loading}
              onPress={onConfirm}
              style={[styles.confirmButton, loading && styles.disabled]}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.textPrimary} />
              ) : (
                <Text style={styles.confirmText}>{t('legal.consentConfirm')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.bgOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.layout.panelGap,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    padding: theme.layout.panelGap * 1.5,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    marginBottom: 12,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  paragraph: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    marginBottom: 12,
  },
  paragraphMuted: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  link: {
    color: theme.colors.accent500,
    textDecorationLine: 'underline',
  },
  linkError: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: theme.layout.panelGap,
  },
  cancelButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSidebar,
  },
  cancelText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  confirmButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent500,
  },
  disabled: {
    opacity: 0.7,
  },
  confirmText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
