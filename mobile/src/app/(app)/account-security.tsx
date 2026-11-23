import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';
import { useE2eeStore } from '@/stores/e2ee';
import { useE2eeBackupStore } from '@/stores/e2eeBackup';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1f §2.1 — Hesap Güvenliği merkezi.
 *
 * "Sen" sekmesindeki dişlinin varış noktası. M1a'da dişli **bilinçle konmamıştı** ("boş yüzey açma"
 * kuralı); tetikleyici buydu — arkasında artık beş gerçek ekran var.
 *
 * Kullanıcı adı satırı **YOK**: sunucuda `POST /auth/username/change` var ama web
 * `usernameReadonlyHint` ile "değiştirilemez" diyor. İki istemci çelişemez; karar gelene kadar
 * mobil web ile aynı hizada (M1f sözleşmesi §0/§4).
 */
export default function AccountSecurityScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const backupEnabled = useE2eeBackupStore((s) => s.state?.enabled === true);
  const identityEnabled = useE2eeStore((s) => s.engine?.identity?.enabled === true);

  if (!user) return null;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('settings.security') }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionTitle}>{t('settings.account.securityTitle')}</Text>
        <View style={styles.group}>
          <Row
            icon="key-outline"
            label={t('security.password.title')}
            onPress={() => router.push('/security-password')}
          />
          {/* Mevcut e-posta değeri satırda gösteriliyor — kullanıcı "hangi adresi değiştiriyorum"
              sorusunu ekrana girmeden yanıtlayabilsin. */}
          <Row
            icon="mail-outline"
            label={t('security.email.title')}
            value={user.email}
            onPress={() => router.push('/security-email')}
          />
          <Row
            icon="shield-checkmark-outline"
            label={t('security.twoFactor.title')}
            value={
              user.twoFactorEnabled
                ? t('security.twoFactor.statusEnabled')
                : t('security.twoFactor.statusDisabled')
            }
            highlight={user.twoFactorEnabled}
            onPress={() => router.push('/security-2fa')}
          />
          <Row
            icon="phone-portrait-outline"
            label={t('security.sessions.title')}
            onPress={() => router.push('/security-sessions')}
            last={!backupEnabled && !identityEnabled}
          />
          {/* E5a: yedek bayrağı kapalıysa satır hiç çıkmaz (boş yüzey yok). */}
          {backupEnabled ? (
            <Row
              icon="cloud-upload-outline"
              label={t('e2ee.backup.title')}
              onPress={() => router.push('/backup-settings')}
              last={!identityEnabled}
            />
          ) : null}
          {/* E7: kimlik bayrağı kapalıysa satır hiç çıkmaz. */}
          {identityEnabled ? (
            <Row
              icon="finger-print-outline"
              label={t('e2ee.identity.sectionTitle')}
              onPress={() => router.push('/identity-settings')}
              last
            />
          ) : null}
        </View>

        {/* Yıkıcı eylem ayrı grupta ve en altta: yanlışlıkla dokunma mesafesini artırır. */}
        <Text style={styles.sectionTitle}>{t('security.deleteAccount.title')}</Text>
        <View style={styles.group}>
          <Row
            icon="trash-outline"
            label={t('security.deleteAccount.title')}
            onPress={() => router.push('/security-delete')}
            danger
            last
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  danger,
  highlight,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
  highlight?: boolean;
  last?: boolean;
}) {
  const tint = danger ? theme.colors.danger : theme.colors.textSecondary;
  return (
    <Pressable onPress={onPress} style={[styles.row, !last && styles.rowDivider]}>
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={[styles.rowValue, highlight && styles.rowValueOn]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: {
    padding: theme.layout.panelGap * 1.5,
    paddingBottom: theme.layout.panelGap * 2,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: theme.layout.panelGap,
  },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: theme.layout.panelGap,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  rowLabel: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  rowLabelDanger: { color: theme.colors.danger },
  rowValue: {
    maxWidth: '45%',
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  rowValueOn: { color: theme.colors.success, fontWeight: '700' },
});
