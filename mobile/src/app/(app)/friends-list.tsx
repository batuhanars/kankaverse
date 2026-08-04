import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useFriendsStore } from '@/stores/friends';
import { useDmStore } from '@/stores/dm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ProfileSheet } from '@/components/profile/ProfileSheet';
import { type FriendDto } from '@/api/friends';
import { extractErrorMessage } from '@/api/errors';
import { dmRouteParams } from '@/utils/dmRoute';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1d-0 contract §3.2 — "Kankalar" tam ekranı. "Sen" sekmesindeki hesap merkezi satırından
// açılır (üst seviye ayrı bir varış noktası DEĞİL — sözleşme §1). Liste zaten `(app)/_layout.tsx`
// mount'unda bir kez çekiliyor (sidebar rozeti için); burada tekrar `fetchAll()` çağrısı listeyi
// tazeler (ekrana her girişte bayat kalmasın).
export default function FriendsListScreen() {
  const router = useRouter();
  const friends = useFriendsStore((s) => s.friends);
  const state = useFriendsStore((s) => s.state);
  const errorMessage = useFriendsStore((s) => s.errorMessage);
  const fetchAll = useFriendsStore((s) => s.fetchAll);
  const removeFriend = useFriendsStore((s) => s.removeFriend);
  const createChannel = useDmStore((s) => s.createChannel);

  const [removeTarget, setRemoveTarget] = useState<FriendDto | null>(null);
  const [cardTarget, setCardTarget] = useState<FriendDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    useFriendsStore.setState({ state: 'loading' });
    fetchAll();
  }

  async function onMessage(friend: FriendDto) {
    setBusyId(friend.user.id);
    setActionError('');
    try {
      const channel = await createChannel(friend.user.id);
      router.push(dmRouteParams(channel));
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onConfirmRemove() {
    if (!removeTarget) return;
    setBusyId(removeTarget.user.id);
    setActionError('');
    try {
      await removeFriend(removeTarget.user.id);
      setRemoveTarget(null);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('friends.title') }} />

      {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {state === 'ready' && friends.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('friends.noFriends')}</Text>
        </View>
      )}

      {state === 'ready' && friends.length > 0 && (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.friendshipId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const busy = busyId === item.user.id;
            return (
              <View style={styles.row}>
                {/* Sprint M1d-0 DoD turu (sahip kararı 2026-07-31) — ada/avatara dokunmak profil
                    panelini açar (M3b §3: kart → alt-panel). Sebep: engelleme mobilde YALNIZ o panel üzerinden
                    yapılabiliyor ve o kart da yalnız DM başlığı + grup üye listesinden açılıyordu;
                    yani hiç DM'leşmediğin bir kankayı engellemenin yolu YOKTU (DoD #2'nin tam
                    senaryosu). Satıra üçüncü bir "Engelle" düğmesi konmadı: engellemenin uygulamada
                    zaten bir evi var, ikinci kapı açmak yerine bu ekran o eve bağlandı. Jest
                    uygulamanın geri kalanıyla aynı (DM başlığı, grup üye listesi). */}
                <Pressable
                  onPress={() => setCardTarget(item)}
                  style={styles.identity}
                  accessibilityRole="button"
                >
                  {item.user.avatarUrl ? (
                    <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarFallbackText}>{item.user.username.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.name} numberOfLines={1}>
                    {item.user.username}
                  </Text>
                </Pressable>
                {/* Sprint M3b §1 — aksiyonlar İKON-ONLY. Metin etiketleri satırın yarısını yiyordu
                    (sahip gözlemi); ad alanı kırpılıyordu. İkonlar web'deki karşılıklarıyla tutarlı
                    (`FriendsPanel.vue` mesaj gönder = sohbet balonu). Etiket ekrandan kalkınca ekran
                    okuyucunun TEK kaynağı `accessibilityLabel` — o yüzden zorunlu, `hitSlop` ile
                    küçültme yok: dokunma hedefi 44dp gerçek kutu olarak duruyor. */}
                <View style={styles.actions}>
                  <Pressable
                    disabled={busy}
                    onPress={() => onMessage(item)}
                    style={styles.dmButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends.dm')}
                  >
                    <Ionicons name="chatbubble-outline" size={20} color={theme.colors.textPrimary} />
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() => setRemoveTarget(item)}
                    style={styles.removeButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends.remove')}
                  >
                    <Ionicons name="person-remove-outline" size={20} color={theme.colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      {cardTarget && (
        <ProfileSheet
          userId={cardTarget.user.id}
          username={cardTarget.user.username}
          avatarUrl={cardTarget.user.avatarUrl}
          onClose={() => setCardTarget(null)}
          // Engelleme arkadaşlığı da siler (blocks.service transaction'ı) → liste sunucudan
          // yeniden okunur; kart kendi içinde `removeLocal` çağırıyor ama tek doğruluk kaynağı sunucu.
          onChanged={() => {
            void fetchAll();
          }}
        />
      )}

      {removeTarget && (
        <ConfirmDialog
          message={t('friends.confirmRemove')}
          confirmLabel={t('friends.remove')}
          loading={busyId === removeTarget.user.id}
          onConfirm={onConfirmRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: 10,
  },
  actionError: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
  },
  retryButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  list: {
    padding: theme.layout.panelGap,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  // Avatar + ad tek dokunma hedefi (profil kartı). `flex: 1` buraya taşındı: eskiden `name`
  // satırdaki boşluğu yiyordu, şimdi sarmalayıcı yiyor ve `name` onun içinde kırpılıyor.
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  // 44dp = Android dokunma hedefi alt sınırı (§1). Daire, çünkü ikon-only düğme kare kutuda
  // "kesilmiş buton" gibi duruyor; web'deki karşılığı da `rounded-full`.
  dmButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
