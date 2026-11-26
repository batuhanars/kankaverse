import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GuildMemberDto, RoleSummaryDto } from '@/api/guilds';
import { MemberRow } from './MemberRow';
import { MessageError, MessageLoading } from '../message/MessageStates';
import { usePresenceStore, type PresenceStatus } from '@/stores/presence';
import { useActivityStore } from '@/stores/activity';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Section {
  key: string;
  title: string;
  data: GuildMemberDto[];
}

/**
 * Sprint C26 contract §1 — web `MemberPanel.vue` `groups` ile birebir (M2c §4.3 yerine geçti):
 * durum `offline` olmayanlar çevrimiçi (haritada yok = çevrimdışı). Çevrimiçiler YALNIZ `hoist` rolleri
 * arasında en yüksek `position`lı role göre gruplanır (`position` DESC), hoist rolü olmayanlar
 * `member.online`a düşer; tüm çevrimdışılar rolüne bakılmaksızın `member.offline` altında toplanır.
 * Boş grup yazılmaz. Grup içi sıra girdi sırasıdır. Ortam hiyerarşisi rozeti `MemberRow`de.
 */
function buildSections(
  members: GuildMemberDto[],
  statusMap: Record<string, PresenceStatus>,
): Section[] {
  const hoistGroups = new Map<string, { role: RoleSummaryDto; members: GuildMemberDto[] }>();
  const noHoistOnline: GuildMemberDto[] = [];
  const offline: GuildMemberDto[] = [];

  for (const m of members) {
    if ((statusMap[m.userId] ?? 'offline') === 'offline') {
      offline.push(m);
      continue;
    }
    const hoistRoles = m.roles.filter((r) => r.hoist);
    if (hoistRoles.length === 0) {
      noHoistOnline.push(m);
      continue;
    }
    const top = hoistRoles.reduce((best, r) => (r.position > best.position ? r : best));
    if (!hoistGroups.has(top.id)) hoistGroups.set(top.id, { role: top, members: [] });
    hoistGroups.get(top.id)!.members.push(m);
  }

  const sections: Section[] = [...hoistGroups.values()]
    .sort((a, b) => b.role.position - a.role.position)
    .map((g) => ({
      key: `hoist-${g.role.id}`,
      title: t('member.hoistGroup', { name: g.role.name, n: g.members.length }),
      data: g.members,
    }));

  if (noHoistOnline.length > 0) {
    sections.push({
      key: 'online',
      title: t('member.online', { n: noHoistOnline.length }),
      data: noHoistOnline,
    });
  }
  if (offline.length > 0) {
    sections.push({ key: 'offline', title: t('member.offline', { n: offline.length }), data: offline });
  }
  return sections;
}

interface Props {
  members: GuildMemberDto[];
  state: 'loading' | 'error' | 'ready';
  errorMessage: string;
  onRetry: () => void;
  /** Davet Et satırı yalnız davet üretebilenlere (mevcut `canManage` mantığı, contract §4.3). */
  canInvite: boolean;
  onInvite: () => void;
  onOpenMember: (userId: string, username: string, avatarUrl: string | null) => void;
}

export function ChannelMembersTab({
  members,
  state,
  errorMessage,
  onRetry,
  canInvite,
  onInvite,
  onOpenMember,
}: Props) {
  const statusMap = usePresenceStore((s) => s.statusMap);
  const gameByUser = useActivityStore((s) => s.byUser);
  const sections = useMemo(() => buildSections(members, statusMap), [members, statusMap]);

  if (state === 'loading') return <MessageLoading />;
  if (state === 'error') return <MessageError message={errorMessage} onRetry={onRetry} />;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(m) => m.userId}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        canInvite ? (
          <Pressable onPress={onInvite} style={styles.inviteRow}>
            <View style={styles.inviteIconWrap}>
              <Ionicons name="person-add-outline" size={18} color={theme.colors.accent500} />
            </View>
            <Text style={styles.inviteText} numberOfLines={1}>
              {t('mobile.channelDetails.inviteMembers')}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null
      }
      renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
      renderItem={({ item }) => (
        <MemberRow
          member={item}
          gameName={
            (statusMap[item.userId] ?? 'offline') !== 'offline'
              ? (gameByUser[item.userId]?.name ?? null)
              : null
          }
          onPress={() => onOpenMember(item.userId, item.username, item.avatarUrl)}
        />
      )}
      ListEmptyComponent={<Text style={styles.empty}>{t('mobile.channelDetails.membersEmpty')}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  // 🔴 Sahip cihaz turu revizesi — düz satır yerine Discord'daki gibi KART: yuvarlatılmış zemin,
  // solda ikon, ortada etiket, sağda chevron (tıklanabilirlik belirsizdi).
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: theme.layout.inputMinHeight,
    marginHorizontal: theme.layout.panelGap,
    marginTop: theme.layout.panelGap,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  inviteIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentSubtle,
  },
  inviteText: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 14,
    paddingBottom: 6,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginTop: theme.layout.panelGap,
  },
});
