import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dmApi } from '@/api/dm';
import { useDmStore } from '@/stores/dm';
import { extractErrorMessage } from '@/api/errors';
import { MessageScreen } from '@/components/MessageScreen';
import { ProfileCardModal } from '@/components/ProfileCardModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1a contract §5 ekran 3 — DM mesaj ekranı: kanal ekranıyla "aynısı" (MessageScreen ortak
// gövde) + başlıkta karşı tarafın adı/avatarı (dokunuş → salt okunur profil kartı, yalnız 1-1 DM'de
// — grup DM'de tek bir "karşı taraf" yok). Sidebar'dan gelen `canMessage`/`selfBlocked` T&S
// durumunu input yerine görünür bir uyarıya çevirir (contract §6 — sessizce gizlenmez).
//
// Sprint M1b contract §3.6 — profil kartı artık aksiyon taşıyor (engelle/arkadaşlıktan çıkar);
// `canMessage`/`selfBlocked` bu yüzden route param'ından SABİT okunmuyor, yerel override state'e
// alındı — engelleme/engel-kaldırma bu ekrandan ayrılmadan giriş kutusunu anında kapatıp açabilsin
// (DoD #9: "Engelledikten sonra DM giriş kutusu kapanıyor").
export default function DmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    avatarUrl?: string;
    otherUserId?: string;
    kind?: 'dm' | 'group';
    canMessage?: string;
    selfBlocked?: string;
  }>();
  const [showProfile, setShowProfile] = useState(false);
  const channelId = params.id;
  const isDm = params.kind !== 'group';

  const [canMessageOverride, setCanMessageOverride] = useState<boolean | null>(null);
  const [selfBlockedOverride, setSelfBlockedOverride] = useState<boolean | null>(null);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');

  // Sözleşme §8.3 — bu DM açıkken gelen mesaj listede "okunmadı" işaretlenmez (web `activeDmChannelId`
  // ile aynı); ayrıca açılışta kutucuğun rozeti hemen düşer (sunucuya `markRead` MessageScreen'den
  // gidiyor, bu yalnız listenin yerel yansıması — bir sonraki `fetchAll`'ı beklemeden).
  useEffect(() => {
    if (!channelId) return;
    const store = useDmStore.getState();
    store.setActiveDm(channelId);
    store.clearUnread(channelId);
    return () => useDmStore.getState().setActiveDm(null);
  }, [channelId]);

  if (!channelId) return null;

  const title = params.title ?? '';

  /** Engelle/engel-kaldır sonrası gerçek durumu sunucudan tazele — yalnız yerel varsayım yapmaz
   *  (T&S disiplini: canMessage backend otoritesinde, istemci gevşetmez/sıkılaştırmaz). */
  async function refreshDmStatus() {
    await useDmStore.getState().fetchAll();
    const updated = useDmStore.getState().channels.find((c) => c.id === channelId);
    if (updated && updated.type === 'DM') {
      setCanMessageOverride(updated.canMessage);
      setSelfBlockedOverride(updated.selfBlocked);
    }
  }

  const canMessage = canMessageOverride ?? params.canMessage !== 'false';
  const selfBlocked = selfBlockedOverride ?? params.selfBlocked === 'true';

  const disabledNotice = isDm && !canMessage ? (selfBlocked ? t('dm.selfBlocked') : t('dm.cannotMessage')) : null;

  const placeholder = isDm ? t('dm.placeholder', { user: title }) : t('dm.groupPlaceholder', { name: title });

  async function onConfirmClear() {
    setClearing(true);
    setClearError('');
    try {
      await useDmStore.getState().clearChannel(channelId);
      setShowClearConfirm(false);
      router.back();
    } catch (e) {
      setClearError(extractErrorMessage(e));
      setClearing(false);
    }
  }

  const headerActions = (
    <>
      {!isDm && (
        <Pressable
          onPress={() => router.push({ pathname: '/group/[id]', params: { id: channelId } })}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.group.manage')}
        >
          <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      )}
      <Pressable
        onPress={() => setShowClearConfirm(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('dm.clearConversation')}
      >
        <Ionicons name="trash-outline" size={20} color={theme.colors.textSecondary} />
      </Pressable>
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable
              onPress={() => isDm && setShowProfile(true)}
              disabled={!isDm}
              style={styles.headerTitle}
            >
              {params.avatarUrl ? (
                <Image source={{ uri: params.avatarUrl }} style={styles.headerAvatar} />
              ) : (
                <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
                  <Text style={styles.headerAvatarText}>{title.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.headerName} numberOfLines={1}>
                {title}
              </Text>
            </Pressable>
          ),
        }}
      />
      <MessageScreen
        channelId={params.id}
        placeholder={placeholder}
        markRead={dmApi.markRead}
        typingMode="simple"
        disabledNotice={disabledNotice}
        headerActions={headerActions}
      />
      {showProfile && isDm && params.otherUserId && (
        <ProfileCardModal
          userId={params.otherUserId}
          username={title}
          avatarUrl={params.avatarUrl ?? null}
          onClose={() => setShowProfile(false)}
          onChanged={refreshDmStatus}
        />
      )}
      {showClearConfirm && (
        <ConfirmDialog
          message={t('dm.clearConfirmMsg')}
          confirmLabel={t('dm.clearButton')}
          loading={clearing}
          onConfirm={onConfirmClear}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
      {clearError ? (
        <View style={styles.clearErrorBar}>
          <Text style={styles.clearErrorText}>{clearError}</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  headerAvatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  headerName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
  clearErrorBar: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  clearErrorText: {
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
  },
});
