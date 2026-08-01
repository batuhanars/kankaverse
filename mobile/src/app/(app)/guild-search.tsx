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
import { extractErrorMessage } from '@/api/errors';
import { formatMentionsPlain } from '@/utils/mentions';
import { SearchFilterSheet } from '@/components/guild/SearchFilterSheet';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** Sunucunun eşiği (`QUERY_TOO_SHORT`) — istemci aynısını önden uygular, boş istek atmaz. */
const MIN_CHARS = 2;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  );
}

/**
 * Sprint M1g §2.2 — **Ortamda Ara** (tam ekran).
 *
 * Web'in `guildSearch.*` sözlüğü zaten vardı ve uç gelişmiş: `q` + `in` (kanal) + `has` (bağlantı/
 * dosya) + `from`/`mentions`. Mobilde bu turda `q` + `in` + `has` bağlandı; `from`/`mentions` üye
 * seçici gerektiriyor, **kapsam dışı** (uç duruyor, yarın açılır).
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

  const activeFilterCount = [filters.in, filters.has].filter(Boolean).length;
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

      {/* Etkin filtreler görünür olmalı: kullanıcı "neden az sonuç geldi" sorusunu ekranı
          okuyarak yanıtlayabilsin. Dokunuş = o filtreyi kaldır. */}
      {activeFilterCount > 0 ? (
        <View style={styles.chipRow}>
          {filters.in ? (
            <FilterChip
              label={`${t('guildSearch.token.in')} ${
                channels.find((c) => c.id === filters.in)?.name ?? ''
              }`}
              onRemove={() => setFilters((f) => ({ ...f, in: undefined }))}
            />
          ) : null}
          {filters.has ? (
            <FilterChip
              label={`${t('guildSearch.token.has')} ${t(`guildSearch.has.${filters.has}`)}`}
              onRemove={() => setFilters((f) => ({ ...f, has: undefined }))}
            />
          ) : null}
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
        renderItem={({ item: group }) => (
          <View style={styles.group}>
            <Text style={styles.groupTitle}>#{group.channelName}</Text>
            {group.messages.map((m) => (
              <Pressable
                key={m.id}
                // Sonuç KANALI açar, mesaja kaydırmaz. Kanallar arası "mesaja atla" kanal
                // ekranında yeni bir yetenek gerektiriyor (şu an yalnız kanal İÇİ arama
                // kaydırabiliyor); yarım çalışan bir atlama yerine kanalı açmak dürüst davranış.
                // Uç tarafında eksik yok, iş istemcide — etkinlik turundan sonra eklenecek.
                onPress={() =>
                  router.push({
                    pathname: '/channel/[id]',
                    params: { id: group.channelId, name: group.channelName },
                  })
                }
                style={styles.result}
              >
                <View style={styles.resultHead}>
                  <Text style={styles.author} numberOfLines={1}>
                    {m.author.username}
                  </Text>
                  <Text style={styles.time}>{formatTime(m.createdAt)}</Text>
                </View>
                <Text style={styles.content} numberOfLines={3}>
                  {/* Bahsedilenler çözümlenmiyor (üye haritası bu ekranda yok) — kanal içi
                      aramanın aynı deseni: ham `<@id>` yerine okunur bir yedek gösterilir. */}
                  {formatMentionsPlain(m.content, () => undefined, t('mention.unknown'))}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />

      {sheetOpen ? (
        <SearchFilterSheet
          channels={channels}
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
  group: { gap: 6 },
  groupTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  result: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    padding: 10,
    gap: 4,
  },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  time: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  content: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, lineHeight: 19 },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginTop: theme.layout.panelGap,
  },
});
