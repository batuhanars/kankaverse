import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { channelsApi, ChannelType } from '@/api/channels';
import { guildsApi } from '@/api/guilds';
import { useDmStore } from '@/stores/dm';
import { channelTitle } from '@/utils/channelTitle';
import { dmRouteParams } from '@/utils/dmRoute';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** C41 - Paylaşımın gidebileceği hedef: DM, grup DM ya da ortam metin kanalı. */
export interface ShareTarget {
  id: string;
  label: string;
  kind: 'dm' | 'group' | 'channel';
  /** Gönderim sonrası açılacak sohbet. */
  href: Href;
}

interface Section {
  key: string;
  title: string;
  data: ShareTarget[];
}

export interface GuildChannels {
  guildId: string;
  guildName: string;
  targets: ShareTarget[];
}

/**
 * Ortamların metin kanalları (mevcut uçlar: ortam listesi + kanal listesi). Kilitli kanal (özel,
 * üye değilim) listelenmez; sesli kanal metin hedefi değildir. Kanal başına yazma izni ayrı bir
 * alan olarak gelmez: kalan kapılar (yavaş mod vb.) sunucuda, ret mesajı gönderimde gösterilir.
 * Mesaj iletme (`ForwardMessageModal`) de aynı listeyi kullanır.
 */
export async function loadGuildTargets(): Promise<GuildChannels[]> {
  const guilds = await guildsApi.list();
  const settled = await Promise.allSettled(guilds.map((g) => channelsApi.listByGuild(g.id)));
  const out: GuildChannels[] = [];
  settled.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;
    const guild = guilds[i];
    const targets: ShareTarget[] = res.value
      .filter((c) => c.type === ChannelType.GUILD_TEXT && !c.locked)
      .map((c) => ({
        id: c.id,
        label: c.name ?? '',
        kind: 'channel' as const,
        href: {
          pathname: '/channel/[id]',
          params: { id: c.id, name: c.name ?? '', guildId: guild.id },
        } as Href,
      }));
    if (targets.length) out.push({ guildId: guild.id, guildName: guild.name, targets });
  });
  return out;
}

interface Props {
  query: string;
  selectedId: string | null;
  disabled: boolean;
  onSelect: (target: ShareTarget) => void;
}

export function ShareTargetList({ query, selectedId, disabled, onSelect }: Props) {
  const dmChannels = useDmStore((s) => s.channels);
  const dmState = useDmStore((s) => s.state);
  const fetchDms = useDmStore((s) => s.fetchAll);
  const [guildGroups, setGuildGroups] = useState<GuildChannels[] | null>(null);

  useEffect(() => {
    void fetchDms();
    let cancelled = false;
    loadGuildTargets()
      .then((g) => !cancelled && setGuildGroups(g))
      .catch(() => !cancelled && setGuildGroups([]));
    return () => {
      cancelled = true;
    };
  }, [fetchDms]);

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    const match = (s: string) => !q || s.toLocaleLowerCase('tr').includes(q);
    const chats: ShareTarget[] = dmChannels
      .map((c) => ({
        id: c.id,
        label: channelTitle(c),
        kind: c.type === 'DM' ? ('dm' as const) : ('group' as const),
        href: dmRouteParams(c) as Href,
      }))
      .filter((x) => match(x.label));
    const out: Section[] = chats.length
      ? [{ key: 'chats', title: t('mobile.share.sectionChats'), data: chats }]
      : [];
    for (const g of guildGroups ?? []) {
      const data = match(g.guildName) ? g.targets : g.targets.filter((x) => match(x.label));
      if (data.length) out.push({ key: g.guildId, title: g.guildName, data });
    }
    return out;
  }, [dmChannels, guildGroups, query]);

  const loading = (dmState === 'loading' && dmChannels.length === 0) || guildGroups === null;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
      renderItem={({ item }) => {
        const selected = item.id === selectedId;
        return (
          <Pressable
            disabled={disabled}
            onPress={() => onSelect(item)}
            style={[styles.row, selected && styles.rowSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Ionicons
              name={item.kind === 'dm' ? 'person' : item.kind === 'group' ? 'people' : 'chatbubble-outline'}
              size={18}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.label} numberOfLines={1}>
              {item.kind === 'channel' ? `# ${item.label}` : item.label}
            </Text>
            {selected ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.accent500} /> : null}
          </Pressable>
        );
      }}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={theme.colors.accent500} style={styles.loading} />
        ) : (
          <View>
            <Text style={styles.empty}>{t('mobile.share.noTargets')}</Text>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: theme.layout.panelGap,
  },
  rowSelected: { backgroundColor: theme.colors.accentSubtle },
  label: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  loading: { marginTop: 32 },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
    marginTop: 32,
  },
});
