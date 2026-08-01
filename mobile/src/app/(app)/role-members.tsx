import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { guildsApi, type GuildMemberDto } from '@/api/guilds';
import { rolesApi } from '@/api/roles';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1e-B §3.6 — role üye ekle/çıkar.
 *
 * Tek liste, iki durum: üyede rol varsa satırda tik, yoksa boş. Discord'un ayrı "Üye ekle" akışı
 * **kopyalanmadı** — iki liste (roldekiler + eklenebilecekler) mobilde aynı ekranda gereksiz ikilem
 * yaratıyordu; tek listede aç/kapa daha az dokunuş.
 *
 * Uçlar idempotent ve **güncel üyeyi dönüyor**, o yüzden yerel liste sunucunun cevabıyla
 * güncelleniyor (iyimser güncelleme yok).
 */
export default function RoleMembersScreen() {
  const params = useLocalSearchParams<{ id: string; guildId: string }>();

  const [members, setMembers] = useState<GuildMemberDto[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      guildsApi
        .getMembers(params.guildId)
        .then((list) => {
          setMembers(list);
          setState('ready');
        })
        .catch((e) => {
          setErrorMessage(extractErrorMessage(e));
          setState('error');
        });
    }, [params.guildId]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return members;
    return members.filter((m) => m.username.toLocaleLowerCase('tr').includes(q));
  }, [members, query]);

  async function toggle(member: GuildMemberDto) {
    if (workingId) return;
    const has = member.roles.some((r) => r.id === params.id);
    setWorkingId(member.userId);
    setErrorMessage('');
    try {
      const updated = has
        ? await rolesApi.unassign(params.id, member.userId)
        : await rolesApi.assign(params.id, member.userId);
      setMembers((prev) => prev.map((m) => (m.userId === updated.userId ? updated : m)));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('guildSettings.roles.manageMembersTitle') }} />

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('guildSettings.roles.memberSearchPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoCorrect={false}
        />
      </View>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'ready' && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>{t('guildSettings.roles.manageMembersEmpty')}</Text>
          }
          renderItem={({ item }) => {
            const has = item.roles.some((r) => r.id === params.id);
            return (
              <Pressable style={styles.row} onPress={() => toggle(item)}>
                <Text style={styles.username} numberOfLines={1}>
                  {item.username}
                </Text>
                {workingId === item.userId ? (
                  <ActivityIndicator color={theme.colors.textMuted} />
                ) : (
                  <Ionicons
                    name={has ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={has ? theme.colors.accent500 : theme.colors.textMuted}
                  />
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  searchWrap: { padding: theme.layout.panelGap },
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 8,
  },
  list: { paddingHorizontal: theme.layout.panelGap, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    marginBottom: 8,
  },
  username: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  empty: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, textAlign: 'center' },
});
