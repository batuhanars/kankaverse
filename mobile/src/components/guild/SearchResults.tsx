import { useMemo } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChannelSummaryDto } from '@/api/channels';
import type { GuildMemberDto } from '@/api/guilds';
import type { GuildSearchGroupDto } from '@/api/messages';
import { SearchResultGroup } from './SearchResultGroup';
import type { SearchTab } from './SearchTabs';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1g R2 — sekmeye göre değişen sonuç gövdesi.
 *
 * Üç davranış var ve farkları bilinçli:
 * - **Mesajlar / Medya / Bağlantılar** → sunucudan gelen kanal-gruplu sonuç.
 * - **Üyeler / Kanallar** → eldeki listenin **yerel** süzülmesi; sorgu boşsa tamamı görünür,
 *   yani sekmeler "arama" değil "gezinme" olarak da çalışır (R2'nin asıl kazancı).
 * - **Sabitlenenler** → kanal listesi; seçilen kanalın sabitlenenler ekranı açılır. Ortam geneli
 *   sabit listesi ucu YOK, her kanala ayrı istek atmak da 40 kanalda 40 istek demek. Kanal
 *   seçtirmek dürüst çözüm.
 */
interface Props {
  tab: SearchTab;
  query: string;
  groups: GuildSearchGroupDto[];
  searched: boolean;
  loading: boolean;
  channels: ChannelSummaryDto[];
  members: GuildMemberDto[];
  onOpenChannel: (channelId: string, name: string) => void;
  onOpenMessage: (channelId: string, name: string, messageId: string) => void;
  onOpenPins: (channelId: string, name: string) => void;
  onOpenMember: (userId: string, username: string, avatarUrl: string | null) => void;
}

export function SearchResults({
  tab,
  query,
  groups,
  searched,
  loading,
  channels,
  members,
  onOpenChannel,
  onOpenMessage,
  onOpenPins,
  onOpenMember,
}: Props) {
  const q = query.trim().toLowerCase();

  const filteredMembers = useMemo(
    () => (q ? members.filter((m) => m.username.toLowerCase().includes(q)) : members),
    [members, q],
  );
  const filteredChannels = useMemo(
    () => (q ? channels.filter((c) => (c.name ?? '').toLowerCase().includes(q)) : channels),
    [channels, q],
  );

  if (tab === 'members') {
    return (
      <FlatList
        data={filteredMembers}
        keyExtractor={(m) => m.userId}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>{t('guildSearch.noMembers')}</Text>}
        renderItem={({ item }) => (
          // C78: üye satırı sohbetteki avatarla aynı profil panelini açar (ortam bağlamıyla).
          <Pressable
            onPress={() => onOpenMember(item.userId, item.username, item.avatarUrl)}
            style={styles.row}
          >
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarLetter}>{item.username.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.rowLabel} numberOfLines={1}>
              {item.username}
            </Text>
          </Pressable>
        )}
      />
    );
  }

  if (tab === 'channels' || tab === 'pins') {
    const isPins = tab === 'pins';
    return (
      <FlatList
        data={filteredChannels}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          isPins ? <Text style={styles.hint}>{t('mobile.guildSearch.pinsHint')}</Text> : null
        }
        ListEmptyComponent={<Text style={styles.empty}>{t('guildSearch.noChannels')}</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              isPins ? onOpenPins(item.id, item.name ?? '') : onOpenChannel(item.id, item.name ?? '')
            }
            style={styles.row}
          >
            <Ionicons
              name={isPins ? 'bookmark-outline' : 'pricetag-outline'}
              size={18}
              color={theme.colors.textMuted}
            />
            <Text style={styles.rowLabel} numberOfLines={1}>
              {item.name}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
          </Pressable>
        )}
      />
    );
  }

  const total = groups.reduce((n, g) => n + g.messages.length, 0);

  return (
    <FlatList
      data={groups}
      keyExtractor={(g) => g.channelId}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        !loading && searched ? (
          <Text style={styles.count}>{t('guildSearch.resultCount', { n: total })}</Text>
        ) : null
      }
      ListEmptyComponent={
        loading ? null : searched ? (
          <Text style={styles.empty}>{t('messageSearch.empty')}</Text>
        ) : (
          <Text style={styles.empty}>{t('mobile.guildSearch.browseHint')}</Text>
        )
      }
      renderItem={({ item }) => (
        <SearchResultGroup
          group={item}
          onOpen={(messageId) => onOpenMessage(item.channelId, item.channelName, messageId)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.layout.panelGap, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
  },
  rowLabel: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
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
  count: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, lineHeight: 19 },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginTop: theme.layout.panelGap,
  },
});
