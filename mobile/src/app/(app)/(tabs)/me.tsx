import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';
import { usersApi, type UserCardDto } from '@/api/users';
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner';
import { ProfileHeader } from '@/components/me/ProfileHeader';
import { FriendsRow } from '@/components/me/FriendsRow';
import { useFriendsStore } from '@/stores/friends';
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
  const [card, setCard] = useState<UserCardDto | null>(null);
  // Kanka listesi store'dan okunur — bu ekran için AYRI bir çekim yapılmıyor; store'u soket katmanı
  // ve Kankalar ekranı zaten güncel tutuyor (arkadaşlık olayları anlık işleniyor).
  const friends = useFriendsStore((s) => s.friends);

  // Odaklanmada tazele: profil düzenleme ekranından dönünce biyografi/görsel güncel görünsün
  // (`ChannelSidebar` ile aynı ders). Hata SESSİZ: kart gelmezse başlık yalnız ad+avatarla çizilir,
  // ekran hata yüzünden kullanılamaz hâle gelmez.
  const userId = user?.id;
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      usersApi
        .getCard(userId)
        .then(setCard)
        .catch(() => {});
    }, [userId]),
  );

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      {!user.emailVerified ? <EmailVerificationBanner /> : null}

      {/* Sprint M1f §2.1 — güvenlik dişlisi. M1a'da bilinçle konmamıştı ("boş yüzey açma"); artık
          arkasında beş gerçek ekran var. Afişin üstünde yüzer, çünkü başlık tam genişlikte. */}
      <Pressable
        onPress={() => router.push('/account-security')}
        style={styles.gear}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('settings.security')}
      >
        <Ionicons name="settings-outline" size={20} color={theme.colors.textPrimary} />
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <ProfileHeader username={user.username} avatarUrl={user.avatarUrl} card={card} />

        <Pressable onPress={() => router.push('/profile-edit')} style={styles.editButton}>
          <Ionicons name="create-outline" size={18} color={theme.colors.textPrimary} />
          <Text style={styles.editButtonText}>{t('mobile.profile.edit')}</Text>
        </Pressable>

        <View style={styles.menu}>
          <View style={styles.menuRowDivider}>
            <FriendsRow friends={friends} onPress={() => router.push('/friends-list')} />
          </View>
          {/* 🔴 Engellenenler satırı KALIR (sahip talimatı 2026-08-01) — profil yeniden
              düzenlenirken kaldırılmadı. */}
          <Pressable onPress={() => router.push('/blocked-list')} style={styles.menuRow}>
            <Ionicons name="ban-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.menuLabel}>{t('friends.tabBlocked')}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        <Pressable onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>{t('common.logout')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  scrollBody: {
    paddingBottom: theme.layout.panelGap * 1.5,
  },
  // Afişin üstünde yüzen dişli: yarı saydam koyu zemin, açık ya da koyu afişte de okunur kalsın.
  gear: {
    position: 'absolute',
    top: 10,
    right: theme.layout.panelGap,
    zIndex: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgOverlay,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: theme.layout.panelGap * 1.5,
    marginTop: theme.layout.panelGap,
    marginBottom: theme.layout.panelGap,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
  },
  editButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
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
    marginTop: theme.layout.panelGap * 1.5,
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
