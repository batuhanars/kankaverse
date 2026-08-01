import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  messagesApi,
  type GuildSearchGroupDto,
  type GuildSearchParams,
} from '@/api/messages';
import { channelsApi, ChannelType, type ChannelSummaryDto } from '@/api/channels';
import { guildsApi, type GuildMemberDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { SearchFilterSheet } from '@/components/guild/SearchFilterSheet';
import { SearchResultGroup } from '@/components/guild/SearchResultGroup';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** Sunucunun eşiği (`QUERY_TOO_SHORT`) — istemci aynısını önden uygular, boş istek atmaz. */
const MIN_CHARS = 2;


/**
 * Sprint M1g §2.2 — **Ortamda Ara** (tam ekran).
 *
 * Web'in `guildSearch.*` sözlüğü zaten vardı ve uç gelişmiş. **Dört filtrenin dördü de bağlı:**
 * `in` (kanal) · `has` (bağlantı/dosya) · `from` (gönderen) · `mentions` (bahsedilen).
 *
 * 🔴 Discord'un **sekmeli** arama ekranı (Yeni/Üyeler/Kanallar/Medya/Sabitlemeler) kopyalanmadı:
 * o sekmelerin çoğunun arkasında bizde özellik yok (sabitleme yüzeyi yok, medya galerisi yok).
 * M1b §3.5'te alınan karar sürüyor — yerleşim alınır, olmayan içerik uydurulmaz.
 *
 * `q` boş bırakılıp yalnız filtreyle arama YAPILABİLİR (sunucu destekliyor): "bu kanaldaki tüm
 * dosyalar" gerçek bir ihtiyaç. Bu yüzden "en az 2 karakter" uyarısı yalnız q doluyken çıkar.
 */
export default function GuildSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guildId: string }>();
  const guildId = params.guildId;

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<GuildSearchParams>({});
  const [channels, setChannels] = useState<ChannelSummaryDto[]>([]);
  const [members, setMembers] = useState<GuildMemberDto[]>([]);
  const [groups, setGroups] = useState<GuildSearchGroupDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kanal listesi filtre paneli için — hata SESSİZ: kanallar gelmezse arama yine çalışır,
  // yalnız kanal filtresi boş kalır (ekran kullanılamaz hâle gelmez).
  useEffect(() => {
    if (!guildId) return;
    channelsApi
      .listByGuild(guildId)
      .then((list) => setChannels(list.filter((c) => c.type === ChannelType.GUILD_TEXT)))
      .catch(() => {});
    guildsApi
      .getMembers(guildId)
      .then(setMembers)
      .catch(() => {});
  }, [guildId]);

  const run = useCallback(
    (q: string, f: GuildSearchParams) => {
      const trimmed = q.trim();
      const hasFilter = Boolean(f.in || f.has || f.from || f.mentions);
      // Ne sorgu ne filtre varsa istek atma — sunucuya "her şeyi getir" demenin anlamı yok.
      if (trimmed.length < MIN_CHARS && !hasFilter) {
        setGroups([]);
        setSearched(false);
        return;
      }
      if (trimmed.length > 0 && trimmed.length < MIN_CHARS) return;

      setLoading(true);
      setErrorMessage('');
      messagesApi
        .searchGuild(guildId, { ...f, q: trimmed || undefined })
        .then((res) => {
          setGroups(res);
          setSearched(true);
        })
        .catch((e) => setErrorMessage(extractErrorMessage(e)))
        .finally(() => setLoading(false));
    },
    [guildId],
  );

  // Yazarken debounce — her tuşta istek atmak hem sunucuyu hem pili yorar (kanal içi aramanın
  // aynı deseni).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(query, filters), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filters, run]);

  const activeFilterCount = [filters.in, filters.has, filters.from, filters.mentions].filter(
    Boolean,
  ).length;
  const memberName = (id?: string) => members.find((m) => m.userId === id)?.username ?? '';

  /** Etkin filtreler görünür olmalı: "neden az sonuç geldi" sorusu ekrandan okunabilsin.
   *  Dokunuş = o filtreyi kaldır. Dört filtre tek listede toplanır, JSX'te dört ayrı dal değil. */
  const chips: { key: 'in' | 'has' | 'from' | 'mentions'; label: string }[] = [];
  if (filters.in) {
    const name = channels.find((c) => c.id === filters.in)?.name ?? '';
    chips.push({ key: 'in', label: `${t('guildSearch.token.in')} ${name}` });
  }
  if (filters.has) {
    chips.push({
      key: 'has',
      label: `${t('guildSearch.token.has')} ${t(`guildSearch.has.${filters.has}`)}`,
    });
  }
  if (filters.from) {
    chips.push({ key: 'from', label: `${t('guildSearch.token.from')} ${memberName(filters.from)}` });
  }
  if (filters.mentions) {
    chips.push({
      key: 'mentions',
      label: `${t('guildSearch.token.mentions')} ${memberName(filters.mentions)}`,
    });
  }
  const total = groups.reduce((n, g) => n + g.messages.length, 0);

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('guildSearch.title') }} />

      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={styles.input}
            placeholder={t('guildSearch.placeholder')}
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <Pressable
          onPress={() => setSheetOpen(true)}
          style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
          accessibilityRole="button"
          accessibilityLabel={t('guildSearch.filters')}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={activeFilterCount > 0 ? theme.colors.accent500 : theme.colors.textSecondary}
          />
        </Pressable>
      </View>

      {activeFilterCount > 0 ? (
        <View style={styles.chipRow}>
          {chips.map((c) => (
            <FilterChip
              key={c.key}
              label={c.label}
              onRemove={() => setFilters((f) => ({ ...f, [c.key]: undefined }))}
            />
          ))}
        </View>
      ) : null}

      {loading ? <ActivityIndicator color={theme.colors.accent500} style={styles.spinner} /> : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      {!loading && searched ? (
        <Text style={styles.count}>{t('guildSearch.resultCount', { n: total })}</Text>
      ) : null}

      <FlatList
        data={groups}
        keyExtractor={(g) => g.channelId}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading && searched ? (
            <Text style={styles.empty}>{t('messageSearch.empty')}</Text>
          ) : !searched ? (
            <Text style={styles.empty}>{t('guildSearch.hint')}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <SearchResultGroup
            group={item}
            onOpen={(messageId) =>
              router.push({
                pathname: '/channel/[id]',
                params: { id: item.channelId, name: item.channelName, jumpTo: messageId },
              })
            }
          />
        )}
      />

      {sheetOpen ? (
        <SearchFilterSheet
          channels={channels}
          members={members}
          value={filters}
          onApply={(next) => {
            setFilters(next);
            setSheetOpen(false);
          }}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </View>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Pressable onPress={onRemove} style={styles.chip}>
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="close" size={14} color={theme.colors.accent500} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  input: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
  },
  filterButtonActive: { backgroundColor: theme.colors.accentSubtle },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentSubtle,
  },
  chipText: { color: theme.colors.accent500, fontSize: theme.fontSize.xs, fontWeight: '700' },
  spinner: { marginTop: 14 },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
  },
  count: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
  },
  list: { padding: theme.layout.panelGap, gap: 14 },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginTop: theme.layout.panelGap,
  },
});
