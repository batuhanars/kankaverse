import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { friendsApi, type FriendDto } from '@/api/friends';
import { guildsApi } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1g R1 — davet ekranındaki **kanka listesi** (sahip bulgusu: davet düğmesi yalnız kod
 * alanına götürüyordu, web'de ise kişi listesi var).
 *
 * Web `InvitePeopleModal.vue` ile aynı davranış: kanka listesi + yerel süzme + kişi başına
 * "Davet Et" → "Davet Edildi ✓". Uç `POST /guilds/:id/invite-friend`, hedefe kalıcı GUILD_INVITE
 * bildirimi düşürüyor (link paylaşmaktan farklı bir yol: karşı taraf uygulamada görüyor).
 *
 * 🔴 Yalnız **kankalar** listelenir. Bu bir istemci kısıtı değil, sunucu zaten arkadaşlık şartı
 * koyuyor; rastgele kullanıcı arayıp davet etme yüzeyi bilinçli olarak yok (T&S duruşu: kullanıcı
 * adıyla arama ucu da yok).
 *
 * Davet edilenler **oturum boyunca** işaretli kalır. Sunucu "davet ettim mi" diye sorulabilecek bir
 * uç vermiyor; ekranı kapatıp açınca işaret sıfırlanır. Bu dürüst davranış — bilmediğimiz bir şeyi
 * biliyormuş gibi göstermektense, o an yaptığımız işi gösteriyoruz.
 */
interface Props {
  guildId: string;
}

export function InviteFriendsSection({ guildId }: Props) {
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [invited, setInvited] = useState<Record<string, true>>({});
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(() => {
    setState('loading');
    friendsApi
      .list()
      .then((list) => {
        setFriends(list);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, []);

  useEffect(load, [load]);

  // Süzme YEREL — kanka listesi zaten elde, her tuşta sunucuya gitmenin anlamı yok (web de öyle).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.user.username.toLowerCase().includes(q));
  }, [friends, query]);

  async function invite(friend: FriendDto) {
    if (sending) return;
    setSending(friend.user.id);
    setErrorMessage('');
    try {
      await guildsApi.inviteFriend(guildId, friend.user.id);
      setInvited((prev) => ({ ...prev, [friend.user.id]: true }));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSending(null);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('invitePeople.friendsLabel')}</Text>

      {state === 'loading' ? (
        <ActivityIndicator color={theme.colors.textMuted} style={styles.spinner} />
      ) : state === 'error' ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable onPress={load} hitSlop={8}>
            <Text style={styles.retry}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : friends.length === 0 ? (
        <Text style={styles.empty}>{t('invitePeople.noFriends')}</Text>
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={styles.input}
            placeholder={t('invitePeople.searchPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            autoCorrect={false}
          />

          {/* FlatList DEĞİL: bu bölüm davet ekranının ScrollView'ı içinde yaşıyor, iç içe aynı
              yöndeki kaydırma listesi RN'de kaydırmayı bozar. Kanka sayısı zaten sınırlı. */}
          {filtered.length === 0 ? (
            <Text style={styles.empty}>{t('invitePeople.noResults')}</Text>
          ) : (
            filtered.map((f) => {
              const done = invited[f.user.id];
              return (
                <View key={f.user.id} style={styles.row}>
                  {f.user.avatarUrl ? (
                    <Image source={{ uri: f.user.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarLetter}>
                        {f.user.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.username} numberOfLines={1}>
                    {f.user.username}
                  </Text>
                  <Pressable
                    onPress={() => invite(f)}
                    disabled={done || sending === f.user.id}
                    style={[styles.inviteButton, done && styles.inviteButtonDone]}
                  >
                    {sending === f.user.id ? (
                      <ActivityIndicator color={theme.colors.textPrimary} size="small" />
                    ) : (
                      <Text style={[styles.inviteText, done && styles.inviteTextDone]}>
                        {done ? t('invitePeople.invited') : t('invitePeople.inviteButton')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })
          )}

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: theme.layout.panelGap },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  spinner: { marginTop: 8 },
  input: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  username: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  inviteButton: {
    minWidth: 92,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteButtonDone: { backgroundColor: theme.colors.bgElevated },
  inviteText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  inviteTextDone: { color: theme.colors.success },
  empty: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm, flex: 1 },
  retry: { color: theme.colors.accent500, fontSize: theme.fontSize.sm, fontWeight: '700' },
});
