import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GuildMemberDto, RoleSummaryDto } from '@/api/guilds';
import { MemberRow } from './MemberRow';
import { MessageError, MessageLoading } from '../message/MessageStates';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Section {
  key: string;
  title: string;
  data: GuildMemberDto[];
}

/**
 * Sprint M2c contract §4.3 — "gruplama istemcide: üyenin en yüksek pozisyonlu rolüne göre başlık,
 * rolsüzler en altta". `position` DESC = en yetkili (bkz. `reorder.tsx` — roller sunucudan zaten bu
 * sırayla döner); bir üyenin BİRDEN FAZLA özel rolü olabilir, bu yüzden en yüksek `position` olan
 * ele alınır. Ortam hiyerarşisi (`member.role` OWNER) BURADA yok — o rozet `MemberRow`in kendisinde,
 * bu gruplama yalnız özel rolleri (`roles[]`) ayırıyor.
 */
function buildSections(members: GuildMemberDto[]): Section[] {
  const byKey = new Map<string, { role: RoleSummaryDto | null; members: GuildMemberDto[] }>();
  for (const m of members) {
    const topRole =
      m.roles.length > 0 ? m.roles.reduce((top, r) => (r.position > top.position ? r : top)) : null;
    const key = topRole?.id ?? '__none__';
    if (!byKey.has(key)) byKey.set(key, { role: topRole, members: [] });
    byKey.get(key)!.members.push(m);
  }

  const sections: Section[] = [...byKey.values()]
    .filter((g) => g.role)
    .sort((a, b) => b.role!.position - a.role!.position)
    .map((g) => ({
      key: g.role!.id,
      title: t('member.hoistGroup', { name: g.role!.name, n: g.members.length }),
      data: g.members,
    }));

  const noRole = byKey.get('__none__');
  if (noRole) {
    sections.push({
      key: '__none__',
      title: t('mobile.channelDetails.noRoleGroup', { n: noRole.members.length }),
      data: noRole.members,
    });
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
  onOpenMember: (userId: string, username: string) => void;
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
  const sections = useMemo(() => buildSections(members), [members]);

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
        <MemberRow member={item} onPress={() => onOpenMember(item.userId, item.username)} />
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
