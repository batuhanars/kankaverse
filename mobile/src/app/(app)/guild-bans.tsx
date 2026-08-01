import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { guildsApi, type GuildBanDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1e §2.5 — Yasaklar. Liste + yasağı kaldır.
 *
 * Uç `BAN_MEMBERS` izni istiyor; yetkisiz kullanıcı bu ekrana zaten Ortam Ayarları'ndan
 * gelemiyor, yine de sunucu 403 dönerse mesajı gösterilir (istemci kapıyı taklit etmez).
 *
 * Yasak sebebi (`reason`) sunucuda opsiyonel; **boşsa satır yazılmaz**, "sebep yok" gibi bir
 * dolgu metni konmaz.
 */
export default function GuildBansScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const guildId = params.id;

  const [bans, setBans] = useState<GuildBanDto[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [target, setTarget] = useState<GuildBanDto | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    guildsApi
      .listBans(guildId)
      .then((list) => {
        setBans(list);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, [guildId]);

  useFocusEffect(load);

  async function onConfirmUnban() {
    if (!target) return;
    setWorking(true);
    setErrorMessage('');
    try {
      await guildsApi.unbanMember(guildId, target.userId);
      setBans((prev) => prev.filter((b) => b.userId !== target.userId));
      setTarget(null);
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('guildSettings.nav.yasaklar') }} />

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
        </View>
      )}

      {state === 'ready' && bans.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('guildSettings.bansEmpty')}</Text>
        </View>
      )}

      {state === 'ready' && bans.length > 0 && (
        <FlatList
          data={bans}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          ListHeaderComponent={errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <View style={styles.avatarTint} />
                  <Text style={styles.avatarLetter}>{item.username.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.body}>
                <Text style={styles.username} numberOfLines={1}>
                  {item.username}
                </Text>
                {item.reason ? (
                  <Text style={styles.reason} numberOfLines={2}>
                    {item.reason}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => setTarget(item)} style={styles.unbanButton}>
                <Text style={styles.unbanText}>{t('guildSettings.unban')}</Text>
              </Pressable>
            </View>
          )}
        />
      )}

      {target && (
        <ConfirmDialog
          message={t('mobile.guildSettings.unbanConfirm', { username: target.username })}
          confirmLabel={t('guildSettings.unban')}
          loading={working}
          onConfirm={onConfirmUnban}
          onCancel={() => setTarget(null)}
        />
      )}
    </View>
  );
}

const AVATAR = 40;

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
    padding: theme.layout.panelGap,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
  list: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: theme.layout.panelGap,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.accentSubtle,
  },
  avatarLetter: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  reason: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  unbanButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unbanText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
