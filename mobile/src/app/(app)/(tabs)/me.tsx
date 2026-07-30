import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1a contract §2 + §5 ekran 6 — "Sen" sekmesi: SALT OKUNUR profil (avatar, kullanıcı adı,
// çıkış yap). Ayarlar M1b'de gelir — burada boş iskele YOK (mobile/CLAUDE.md yasağı); yalnız bu
// sprintte gerçekten var olan şey gösteriliyor.
// Sprint M1c contract §3.4 — doğrulama bandı yalnız `emailVerified === false` iken mount edilir
// (web `AppShell.vue` deseniyle birebir aynı gate — boş yüzey açılmaz).
//
// Sprint M1d-0 contract §1/§3.1 — "Sen" hesap merkezine dönüşür: mevcut içerik korunur, altına
// Kankalar/Engellenenler satırları eklenir. Üst seviye ayrı bir "Kankalar" varış noktası AÇILMADI
// (sahip kararı, sözleşme §0) — bu satırlar hesap merkezinin İÇİNDE, tab çubuğu hâlâ 3 eleman.
export default function MeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      {!user.emailVerified ? <EmailVerificationBanner /> : null}
      <View style={styles.center}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{user.username.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.username}>{user.username}</Text>
      </View>

      <View style={styles.menu}>
        <Pressable
          onPress={() => router.push('/friends-list')}
          style={[styles.menuRow, styles.menuRowDivider]}
        >
          <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.menuLabel}>{t('friends.title')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>
        <Pressable onPress={() => router.push('/blocked-list')} style={styles.menuRow}>
          <Ionicons name="ban-outline" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.menuLabel}>{t('friends.tabBlocked')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <Pressable onPress={onLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>{t('common.logout')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
    paddingTop: theme.layout.panelGap * 1.5,
    paddingBottom: theme.layout.panelGap,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 16,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: 32,
    fontWeight: '700',
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  menu: {
    marginHorizontal: theme.layout.panelGap * 1.5,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: theme.layout.panelGap,
  },
  menuRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  menuLabel: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  logoutButton: {
    marginTop: 'auto',
    marginHorizontal: theme.layout.panelGap * 1.5,
    marginBottom: theme.layout.panelGap * 1.5,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: theme.layout.panelGap * 1.5,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
});
