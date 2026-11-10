import { useMemo, useState } from 'react';
import { Image, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePresenceStore } from '@/stores/presence';
import { useActivityStore } from '@/stores/activity';
import { PresenceDot } from '../PresenceDot';
import type { DmChannelDto, DmParticipantDto } from '@/api/dm';
import { useAuthStore } from '@/stores/auth';
import { useDmStore } from '@/stores/dm';
import { canModerateGroupTarget, groupRoleOf } from '@/utils/groupRoles';
import { extractErrorMessage } from '@/api/errors';
import { ConfirmDialog } from '../ConfirmDialog';
import { ProfileSheet } from '../profile/ProfileSheet';
import { t } from '@/i18n';
import { theme } from '@/theme';

type GroupDmChannel = Extract<DmChannelDto, { type: 'GROUP_DM' }>;

interface Props {
  channel: GroupDmChannel;
}

/**
 * Sprint M3b §2.3.1 — grup DM'in **Üyeler sekmesi**. `group/[id].tsx`in liste gövdesi buraya
 * **davranışıyla birlikte** taşındı; o ekran ve rotası kaldırıldı.
 *
 * 🔴 **`ChannelMembersTab` yeniden KULLANILMADI** (sözleşme §2.1, bilinçli): ortam üyesi
 * `GuildMemberDto` ve o sekme üyeleri **en yüksek pozisyonlu role göre bölümlere ayırıyor**. Grup
 * DM üyesi `DmParticipantDto`; **rol diye bir şey yok**, gruplama da yok. O bileşeni iki şekle
 * genelleştirmek, çalışan bir bileşene tanımı gereği hiç kesişmeyen bir dal eklemek olurdu.
 * Ortak olan satır GÖRÜNÜMÜ, sekmenin kendisi değil.
 *
 * Taşınan davranışlar (DoD'da tek tek yazılı — düşerse yetenek kaybı olur):
 * - Grup sahibi satırında **👑**
 * - **✕ üye çıkarma yalnız grup sahibine görünür**, `ConfirmDialog` onayı korunur. Bu satır
 *   aksiyonu ⋯ menüsündeki dörtlünün içinde DEĞİL; düşseydi grup sahibi üye çıkaramaz hale
 *   gelirdi (M1d-0'daki "engelleme kayboldu" hatasının aynısı).
 * - **Kendi satırın dokunulabilir değil** (kendini engelleyemez/çıkaramazsın)
 * - Üye satırına dokunma → profil alt-paneli (§3)
 *
 * Grup yöneticisi (2026-11-10): kurucu üyeye yöneticilik verip alır (kalkan düğmesi); yönetici
 * normal üyeleri çıkarabilir. Hiyerarşi `utils/groupRoles` (sunucu `shared/group-roles` aynası);
 * istemci yalnız gizler, kapı sunucuda (R7).
 */
export function GroupMembersTab({ channel }: Props) {
  const authUser = useAuthStore((s) => s.user);
  const removeGroupMember = useDmStore((s) => s.removeGroupMember);
  const setGroupAdmin = useDmStore((s) => s.setGroupAdmin);

  const [removeTarget, setRemoveTarget] = useState<DmParticipantDto | null>(null);
  const [profileTarget, setProfileTarget] = useState<DmParticipantDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const isOwner = authUser?.id === channel.ownerId;
  const myRole = groupRoleOf(channel, authUser?.id);
  const isAdmin = (id: string) => groupRoleOf(channel, id) === 'admin';
  const canRemove = (id: string) =>
    id !== authUser?.id && canModerateGroupTarget(myRole, groupRoleOf(channel, id));
  const statusMap = usePresenceStore((s) => s.statusMap);
  const gameByUser = useActivityStore((s) => s.byUser);
  const sections = useMemo(() => {
    // Sıra: kurucu, yöneticiler, üyeler; bölümlere ayırma sırayı bozmaz.
    const order = { owner: 0, admin: 1, member: 2 } as const;
    const sorted = [...channel.members].sort(
      (a, b) => order[groupRoleOf(channel, a.id)] - order[groupRoleOf(channel, b.id)],
    );
    const online = sorted.filter((m) => (statusMap[m.id] ?? 'offline') !== 'offline');
    const offline = sorted.filter((m) => (statusMap[m.id] ?? 'offline') === 'offline');
    const result: { key: string; title: string; data: DmParticipantDto[] }[] = [];
    if (online.length > 0) {
      result.push({ key: 'online', title: t('member.online', { n: online.length }), data: online });
    }
    if (offline.length > 0) {
      result.push({ key: 'offline', title: t('member.offline', { n: offline.length }), data: offline });
    }
    return result;
  }, [channel, statusMap]);

  async function onToggleAdmin(member: DmParticipantDto) {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      await setGroupAdmin(channel.id, member.id, !isAdmin(member.id));
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveMember() {
    if (!removeTarget) return;
    setBusy(true);
    setActionError('');
    try {
      await removeGroupMember(channel.id, removeTarget.id);
      setRemoveTarget(null);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.flex}>
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => (
          // Kendi satırım paneli açmaz (kendimi engelleyemem/çıkaramam) — dokunulabilirlik de verilmez.
          <Pressable
            onPress={() => item.id !== authUser?.id && setProfileTarget(item)}
            disabled={item.id === authUser?.id}
            style={styles.memberRow}
          >
            <View style={styles.avatar}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarImage, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>{item.username.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              {/* Bu listede çevrimdışı da gri nokta alır (C28 §2.2); bölüm başlığı zaten durumu söylüyor. */}
              <PresenceDot
                status={statusMap[item.id] ?? 'offline'}
                size={12}
                ringColor={theme.colors.bgContent}
              />
            </View>
            <View style={styles.memberTexts}>
              <Text style={styles.memberName} numberOfLines={1}>
                {item.username}
              </Text>
              {gameByUser[item.id] && (statusMap[item.id] ?? 'offline') !== 'offline' ? (
                <View style={styles.memberPlayingRow}>
                  <Ionicons
                    name="game-controller"
                    size={12}
                    color={theme.colors.online}
                  />
                  <Text style={styles.memberPlaying} numberOfLines={1}>
                    {gameByUser[item.id].name}
                  </Text>
                </View>
              ) : null}
            </View>
            {item.id === channel.ownerId ? (
              <Text style={styles.ownerBadge}>👑</Text>
            ) : isAdmin(item.id) ? (
              <Text style={styles.adminBadge}>{t('group.admin')}</Text>
            ) : null}
            {isOwner && item.id !== channel.ownerId ? (
              <Pressable
                onPress={() => void onToggleAdmin(item)}
                disabled={busy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={isAdmin(item.id) ? t('group.removeAdmin') : t('group.makeAdmin')}
              >
                <Ionicons
                  name={isAdmin(item.id) ? 'shield' : 'shield-outline'}
                  size={18}
                  color={isAdmin(item.id) ? theme.colors.accent500 : theme.colors.textMuted}
                />
              </Pressable>
            ) : null}
            {canRemove(item.id) ? (
              <Pressable
                onPress={() => setRemoveTarget(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('group.removeMember')}
              >
                <Text style={styles.removeIcon}>✕</Text>
              </Pressable>
            ) : null}
          </Pressable>
        )}
      />

      {profileTarget && (
        <ProfileSheet
          userId={profileTarget.id}
          username={profileTarget.username}
          avatarUrl={profileTarget.avatarUrl}
          onClose={() => setProfileTarget(null)}
          // Engelleme/kankalıktan çıkarma sonrası kanal listesi tazelenir (üye adı/durumu güncel kalsın).
          onChanged={() => useDmStore.getState().fetchAll()}
        />
      )}

      {removeTarget && (
        <ConfirmDialog
          message={t('group.removeMemberConfirm', { username: removeTarget.username })}
          confirmLabel={t('group.removeMemberAction')}
          loading={busy}
          onConfirm={onRemoveMember}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: 8, paddingVertical: 6 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  avatar: { width: 32, height: 32 },
  avatarImage: { width: 32, height: 32, borderRadius: 16 },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingTop: 14,
    paddingBottom: 6,
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
  memberTexts: { flex: 1, minWidth: 0 },
  memberPlayingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  memberPlaying: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
  memberName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  ownerBadge: { fontSize: theme.fontSize.base },
  adminBadge: {
    color: theme.colors.accent500,
    backgroundColor: theme.colors.accentSubtle,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  removeIcon: { color: theme.colors.danger, fontSize: theme.fontSize.base },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 6,
  },
});
