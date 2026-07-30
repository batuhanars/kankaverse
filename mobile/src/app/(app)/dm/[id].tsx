import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { dmApi } from '@/api/dm';
import { MessageScreen } from '@/components/MessageScreen';
import { ProfileCardModal } from '@/components/ProfileCardModal';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1a contract §5 ekran 3 — DM mesaj ekranı: kanal ekranıyla "aynısı" (MessageScreen ortak
// gövde) + başlıkta karşı tarafın adı/avatarı (dokunuş → salt okunur profil kartı, yalnız 1-1 DM'de
// — grup DM'de tek bir "karşı taraf" yok). Sidebar'dan gelen `canMessage`/`selfBlocked` T&S
// durumunu input yerine görünür bir uyarıya çevirir (contract §6 — sessizce gizlenmez).
export default function DmScreen() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    avatarUrl?: string;
    kind?: 'dm' | 'group';
    canMessage?: string;
    selfBlocked?: string;
  }>();
  const [showProfile, setShowProfile] = useState(false);

  if (!params.id) return null;

  const title = params.title ?? '';
  const isDm = params.kind !== 'group';

  const disabledNotice =
    isDm && params.selfBlocked === 'true'
      ? t('dm.selfBlocked')
      : isDm && params.canMessage === 'false'
        ? t('dm.cannotMessage')
        : null;

  const placeholder = isDm ? t('dm.placeholder', { user: title }) : t('dm.groupPlaceholder', { name: title });

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
      />
      {showProfile && isDm && (
        <ProfileCardModal username={title} avatarUrl={params.avatarUrl ?? null} onClose={() => setShowProfile(false)} />
      )}
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
});
