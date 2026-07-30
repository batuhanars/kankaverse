import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  username: string;
  avatarUrl: string | null;
  onClose: () => void;
}

// Sprint M1a contract §5 ekran 3 — DM başlığında karşı tarafın adına/avatarına dokununca açılan
// SALT OKUNU profil kartı (düzenleme M1b). Zengin profil (bio/ortak kanka) ayrı bir uç ister;
// contract §3 endpoint tablosunda böyle bir uç YOK — bu yüzden yalnız elde bulunan veri
// (DM listesinden gelen avatar+kullanıcı adı) gösterilir; ek REST çağrısı yapılmaz.
export function ProfileCardModal({ username, avatarUrl, onClose }: Props) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* İç Pressable dokunuşu yakalar — backdrop'un onClose'una sızmaz (RN'de nested Pressable jesti üstlenir). */}
        <Pressable style={styles.card} onPress={() => {}}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>{username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.username}>{username}</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
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
    maxWidth: 320,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    padding: theme.layout.panelGap * 1.5,
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 12,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    marginBottom: theme.layout.panelGap,
  },
  closeButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: theme.layout.panelGap,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
