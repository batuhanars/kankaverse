import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { guildsApi, type GuildMemberDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { MemberRow } from '@/components/guild/MemberRow';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1e §2.3 — Üyeler. Arama + rol rozetli satırlar (Discord düzeni).
 *
 * Arama **istemci tarafında**: sunucuda üye arama ucu yok ve ortam üye sayıları bu ölçekte
 * (yüzler) istemci süzmesiyle rahat kalkıyor. Sunucu tarafı arama gerekirse ayrı karar.
 */
export default function GuildMembersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const guildId = params.id;

  const [members, setMembers] = useState<GuildMemberDto[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');

  // Odaklanmada tazele: üye ekranından rol/rol-değişimi ile dönünce liste güncel olsun.
  useFocusEffect(
    useCallback(() => {
      guildsApi
        .getMembers(guildId)
        .then((list) => {
          setMembers(list);
          setState('ready');
        })
        .catch((e) => {
          setErrorMessage(extractErrorMessage(e));
          setState('error');
        });
    }, [guildId]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return members;
    return members.filter((m) => m.username.toLocaleLowerCase('tr').includes(q));
  }, [members, query]);

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('member.panel') }} />

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('common.search')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoCorrect={false}
        />
      </View>

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

      {state === 'ready' && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <MemberRow
              member={item}
              onPress={() =>
                router.push({
                  pathname: '/guild-member',
                  params: { guildId, userId: item.userId, name: params.name ?? '' },
                })
              }
            />
          )}
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
  searchWrap: {
    padding: theme.layout.panelGap,
  },
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  list: {
    paddingBottom: 24,
  },
});
