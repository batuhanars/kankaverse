import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { messagesApi, type GuildSearchGroupDto, type GuildSearchParams } from '@/api/messages';
import { channelsApi, ChannelType, type ChannelSummaryDto } from '@/api/channels';
import { guildsApi, type GuildMemberDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { SearchFilterMenu, type FilterKind } from '@/components/guild/SearchFilterMenu';
import { FilterValueSheet } from '@/components/guild/FilterValueSheet';
import { SearchTabs, type SearchTab } from '@/components/guild/SearchTabs';
import { SearchResults } from '@/components/guild/SearchResults';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** Sunucunun eşiği (`QUERY_TOO_SHORT`) — istemci aynısını önden uygular, boş istek atmaz. */
const MIN_CHARS = 2;

/** Arama çubuğundaki pill: hangi filtre, hangi değer, ekranda nasıl yazıyor. */
export interface SearchToken {
  kind: FilterKind;
  value: string;
  label: string;
}

/**
 * Sprint M1g §2.2 + **R2 sahip revizesi 2026-08-01** — Ortamda Ara.
 *
 * R2'de iki şey değişti:
 * 1. **Sekmeler** (Mesajlar · Üyeler · Kanallar · Medya · Bağlantılar · Sabitlenenler). Discord'un
 *    yedi sekmesinden arkası dolu olan altısı; "Yeni/Önerilen" alınmadı, öneri verimiz yok.
 *    Asıl kazanç: **hiç yazmadan gezinilebiliyor** — önceki tasarım "önce yaz" diyordu.
 * 2. **Token (pill) filtreleri** — panel + "Uygula" gitti. Menüden tür seç → değerini seç → pill
 *    arama çubuğuna düşsün, yazmaya devam et. Bu aynı zamanda **parite düzeltmesi**: web zaten
 *    `guildSearch.token.*` metinleriyle bu akışı kullanıyor, panelli tasarım benim sapmamdı.
 *
 * Sekme ile token aynı sorguyu besler: Medya `has=file`, Bağlantılar `has=link`. Çakışırsa **sekme
 * kazanır** — kullanıcının en son dokunduğu şey odur.
 */
export default function GuildSearchScreen() {
  const router = useRouter();
  const { guildId } = useLocalSearchParams<{ guildId: string }>();

  const [tab, setTab] = useState<SearchTab>('messages');
  const [query, setQuery] = useState('');
  const [tokens, setTokens] = useState<SearchToken[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickKind, setPickKind] = useState<FilterKind | null>(null);

  const [channels, setChannels] = useState<ChannelSummaryDto[]>([]);
  const [members, setMembers] = useState<GuildMemberDto[]>([]);
  const [groups, setGroups] = useState<GuildSearchGroupDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Üye ve kanal listeleri ekran açılır açılmaz gelir: sekmeler bunlarla **sorgu olmadan** dolar.
  // Hata SESSİZ — listeler gelmezse mesaj araması yine çalışır, ekran kullanılamaz hâle gelmez.
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

  /** Token listesi + sekme → sunucunun beklediği sorgu parametreleri. */
  const buildParams = useCallback(
    (q: string, list: SearchToken[], activeTab: SearchTab): GuildSearchParams => {
      const params: GuildSearchParams = { q: q.trim() || undefined };
      for (const tk of list) {
        if (tk.kind === 'has') params.has = tk.value as 'link' | 'file';
        else params[tk.kind] = tk.value;
      }
      // Sekme `has`'i EZER: Medya sekmesindeyken bağlantı sonucu görmek istenmez.
      if (activeTab === 'media') params.has = 'file';
      if (activeTab === 'links') params.has = 'link';
      return params;
    },
    [],
  );

  const run = useCallback(
    (q: string, list: SearchToken[], activeTab: SearchTab) => {
      // Üye/kanal/sabitlenenler sekmeleri sunucuya GİTMEZ: ilk ikisi eldeki listeyi yerel süzer,
      // sabitlenenler ise kanal seçimi ister (ortam geneli sabit listesi ucu yok).
      if (activeTab === 'members' || activeTab === 'channels' || activeTab === 'pins') return;

      const params = buildParams(q, list, activeTab);
      const hasFilter = Boolean(params.in || params.has || params.from || params.mentions);
      const trimmed = (params.q ?? '').trim();
      if (trimmed.length < MIN_CHARS && !hasFilter) {
        setGroups([]);
        setSearched(false);
        return;
      }
      if (trimmed.length > 0 && trimmed.length < MIN_CHARS) return;

      setLoading(true);
      setErrorMessage('');
      messagesApi
        .searchGuild(guildId, params)
        .then((res) => {
          setGroups(res);
          setSearched(true);
        })
        .catch((e) => setErrorMessage(extractErrorMessage(e)))
        .finally(() => setLoading(false));
    },
    [guildId, buildParams],
  );

  // Yazarken debounce — her tuşta istek atmak hem sunucuyu hem pili yorar.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(query, tokens, tab), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tokens, tab, run]);

  function addToken(kind: FilterKind, value: string, label: string) {
    setPickKind(null);
    // Aynı türden ikinci token eklenmez — sunucu tek değer alıyor, ikincisi sessizce yutulurdu.
    setTokens((prev) => [...prev.filter((tk) => tk.kind !== kind), { kind, value, label }]);
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('guildSearch.title') }} />

      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />

          {/* Token'lar giriş alanının İÇİNDE, metinden önce — "şu kullanıcıdan: Ali" cümlesinin
              devamını yazıyormuş hissi verir. Dokunuş o token'ı kaldırır. */}
          {tokens.map((tk) => (
            <Pressable
              key={tk.kind}
              onPress={() => setTokens((prev) => prev.filter((x) => x.kind !== tk.kind))}
              style={styles.token}
            >
              <Text style={styles.tokenText} numberOfLines={1}>
                {t(`guildSearch.token.${tk.kind}`)} {tk.label}
              </Text>
              <Ionicons name="close" size={13} color={theme.colors.accent500} />
            </Pressable>
          ))}

          <TextInput
            value={query}
            onChangeText={setQuery}
            style={styles.input}
            placeholder={tokens.length === 0 ? t('guildSearch.placeholder') : ''}
            placeholderTextColor={theme.colors.textMuted}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        <Pressable
          onPress={() => setMenuOpen(true)}
          style={[styles.filterButton, tokens.length > 0 && styles.filterButtonActive]}
          accessibilityRole="button"
          accessibilityLabel={t('guildSearch.filters')}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={tokens.length > 0 ? theme.colors.accent500 : theme.colors.textSecondary}
          />
        </Pressable>
      </View>

      <SearchTabs active={tab} onChange={setTab} />

      {loading ? <ActivityIndicator color={theme.colors.accent500} style={styles.spinner} /> : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <SearchResults
        tab={tab}
        query={query}
        groups={groups}
        searched={searched}
        loading={loading}
        channels={channels}
        members={members}
        onOpenChannel={(id, name) =>
          router.push({ pathname: '/channel/[id]', params: { id, name, guildId } })
        }
        onOpenMessage={(channelId, name, messageId) =>
          router.push({
            pathname: '/channel/[id]',
            params: { id: channelId, name, guildId, jumpTo: messageId },
          })
        }
        onOpenPins={(channelId, name) =>
          router.push({ pathname: '/pins', params: { channelId, name } })
        }
        onOpenMember={(userId, username) =>
          router.push({ pathname: '/guild-member', params: { guildId, userId, name: username } })
        }
      />

      {menuOpen ? (
        <SearchFilterMenu
          onPick={(kind) => {
            setMenuOpen(false);
            setPickKind(kind);
          }}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}

      {pickKind ? (
        <FilterValueSheet
          kind={pickKind}
          channels={channels}
          members={members}
          onSelect={(value, label) => addToken(pickKind, value, label)}
          onClose={() => setPickKind(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 10,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  input: { flex: 1, minWidth: 60, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  token: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '80%',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.accentSubtle,
  },
  tokenText: { color: theme.colors.accent500, fontSize: theme.fontSize.xs, fontWeight: '700' },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
  },
  filterButtonActive: { backgroundColor: theme.colors.accentSubtle },
  spinner: { marginTop: 14 },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
  },
});
