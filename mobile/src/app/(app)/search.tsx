import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { guildsApi, type GuildSummaryDto } from '@/api/guilds';
import { channelsApi, ChannelType } from '@/api/channels';
import { useDmStore } from '@/stores/dm';
import type { DmChannelDto } from '@/api/dm';
import { dmRouteParams } from '@/utils/dmRoute';
import { t } from '@/i18n';
import { theme } from '@/theme';

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'guild'; key: string; guild: GuildSummaryDto }
  | { kind: 'dm'; key: string; channel: DmChannelDto };

function dmDisplayName(ch: DmChannelDto): string {
  if (ch.type === 'DM') return ch.otherUser.username;
  if (ch.name) return ch.name;
  const names = ch.members.map((m) => m.username);
  return names.length <= 2 ? names.join(', ') : names.slice(0, 2).join(', ') + ` +${names.length - 2}`;
}

function dmAvatar(ch: DmChannelDto): string | null {
  return ch.type === 'DM' ? ch.otherUser.avatarUrl : (ch.members[0]?.avatarUrl ?? null);
}

// Sözleşme §3.4 — DM+ortam+kanal listesinde YEREL süzme (istemci tarafı, ek uç yok). Web
// `GlobalSearch.vue` deseni birebir: gruplu sonuç (ORTAMLAR/KANKALAR/GRUPLAR), boş durum. Ortam
// seçimi ilk metin kanalına düşer (guild'in kendi "içerik" ekranı yok — mobil mimarisi rail+sidebar,
// bu ekrandan direkt bir kanala gidilir).
export default function SearchScreen() {
  const router = useRouter();
  const channels = useDmStore((s) => s.channels);
  const [query, setQuery] = useState('');
  const [guilds, setGuilds] = useState<GuildSummaryDto[]>([]);

  useEffect(() => {
    guildsApi
      .list()
      .then(setGuilds)
      .catch(() => setGuilds([]));
  }, []);

  const q = query.trim().toLocaleLowerCase('tr');

  const filteredGuilds = useMemo(
    () => (q ? guilds.filter((g) => g.name.toLocaleLowerCase('tr').includes(q)) : guilds),
    [guilds, q],
  );
  const filteredDms = useMemo(
    () =>
      channels.filter(
        (c) => c.type === 'DM' && (!q || c.otherUser.username.toLocaleLowerCase('tr').includes(q)),
      ),
    [channels, q],
  );
  const filteredGroups = useMemo(
    () =>
      channels.filter((c) => {
        if (c.type !== 'GROUP_DM') return false;
        if (!q) return true;
        const nameMatch = c.name?.toLocaleLowerCase('tr').includes(q) ?? false;
        const memberMatch = c.members.some((m) => m.username.toLocaleLowerCase('tr').includes(q));
        return nameMatch || memberMatch;
      }),
    [channels, q],
  );

  const rows: Row[] = [];
  if (filteredGuilds.length) {
    rows.push({ kind: 'header', key: 'h-guilds', label: t('search.sectionGuilds') });
    filteredGuilds.forEach((g) => rows.push({ kind: 'guild', key: `g-${g.id}`, guild: g }));
  }
  if (filteredDms.length) {
    rows.push({ kind: 'header', key: 'h-dms', label: t('search.sectionDms') });
    filteredDms.forEach((c) => rows.push({ kind: 'dm', key: `d-${c.id}`, channel: c }));
  }
  if (filteredGroups.length) {
    rows.push({ kind: 'header', key: 'h-groups', label: t('search.sectionGroups') });
    filteredGroups.forEach((c) => rows.push({ kind: 'dm', key: `p-${c.id}`, channel: c }));
  }

  async function onSelectGuild(guildId: string) {
    try {
      const list = await channelsApi.listByGuild(guildId);
      const textOnly = list.filter((c) => c.type === ChannelType.GUILD_TEXT).sort((a, b) => a.position - b.position);
      if (textOnly.length > 0) {
        router.push({ pathname: '/channel/[id]', params: { id: textOnly[0].id, name: textOnly[0].name ?? '' } });
      }
    } catch {
      // kanal listesi çekilemedi — sessizce geç, kullanıcı ana sayfadan devam eder
    }
  }

  function onSelectDm(channel: DmChannelDto) {
    router.push(dmRouteParams(channel));
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('search.title') }} />

      <View style={styles.inputRow}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoFocus
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return <Text style={styles.sectionHeader}>{item.label}</Text>;
          }
          if (item.kind === 'guild') {
            return (
              <Pressable onPress={() => onSelectGuild(item.guild.id)} style={styles.row}>
                <View style={styles.guildIcon}>
                  <Text style={styles.guildIconText}>{item.guild.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {item.guild.name}
                </Text>
              </Pressable>
            );
          }
          const name = dmDisplayName(item.channel);
          const avatar = dmAvatar(item.channel);
          return (
            <Pressable onPress={() => onSelectDm(item.channel)} style={styles.row}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>{t('search.empty')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: theme.layout.panelGap,
    paddingHorizontal: 14,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  sectionHeader: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
  },
  guildIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guildIconText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  center: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
  },
});
