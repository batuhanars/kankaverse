import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { guildsApi, type GuildMemberDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { t } from '@/i18n';
import { theme } from '@/theme';

type Pending = 'kick' | 'ban' | 'transfer' | null;

/**
 * Sprint M1e §2.4 — Üye ekranı: roller · ortam rolü · at · yasakla · sahipliği devret.
 *
 * 🔴 **Yetki kararı sunucudadır.** Hiyerarşi (OWNER > ADMIN > MEMBER) sunucuda uygulanıyor; burada
 * yapılan tek şey, çağıranın kendi yetkisine göre satırı **hiç render etmemek**. İstemci kararı
 * yeniden hesaplamıyor, gevşetmiyor; sunucu reddederse mesajı gösteriliyor.
 *
 * 🔴 **Takma ad alanı YOK**: `GuildMember`de böyle bir alan yok (izin anahtarları i18n'de duruyor
 * ama özellik hiç uygulanmamış). Discord'da var diye boş kutu konmadı.
 *
 * Rol ATAMA (özel roller) B yarısında: rol listesi ekranı orada geliyor, buradan yalnız mevcut
 * roller gösteriliyor — hedefi olmayan "Rolleri Düzenle" satırı şimdilik konmadı.
 */
export default function GuildMemberScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guildId: string; userId: string; name?: string }>();
  const { guildId, userId } = params;
  const myUserId = useAuthStore((s) => s.user?.id ?? null);

  const [members, setMembers] = useState<GuildMemberDto[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState(false);

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

  const member = members.find((m) => m.userId === userId) ?? null;
  const me = members.find((m) => m.userId === myUserId) ?? null;
  const isSelf = userId === myUserId;
  const iAmOwner = me?.role === 'OWNER';
  const iAmAdmin = me?.role === 'ADMIN';

  // Sunucu hiyerarşisinin aynası (yalnız GÖRÜNÜRLÜK için): OWNER, ADMIN ve MEMBER'a dokunabilir;
  // ADMIN yalnız MEMBER'a. Kendine ve OWNER'a kimse dokunamaz.
  const canModerate =
    !!member && !isSelf && member.role !== 'OWNER' && (iAmOwner || (iAmAdmin && member.role === 'MEMBER'));
  const canChangeGuildRole = !!member && !isSelf && iAmOwner && member.role !== 'OWNER';
  const canTransfer = !!member && !isSelf && iAmOwner && member.role !== 'OWNER';

  async function run(action: () => Promise<unknown>, after: 'back' | 'reload') {
    setWorking(true);
    setErrorMessage('');
    try {
      await action();
      setPending(null);
      if (after === 'back') router.back();
      else {
        const list = await guildsApi.getMembers(guildId);
        setMembers(list);
      }
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
      setPending(null);
    } finally {
      setWorking(false);
    }
  }

  if (state === 'loading') {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '' }} />
        <ActivityIndicator color={theme.colors.accent500} />
      </View>
    );
  }

  if (!member) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.error}>{errorMessage || t('member.errors.NOT_FOUND')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: member.username }} />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          {member.avatarUrl ? (
            <Image source={{ uri: member.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <View style={styles.avatarTint} />
              <Text style={styles.avatarLetter}>{member.username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.username}>{member.username}</Text>
          {member.role !== 'MEMBER' && (
            <View style={styles.guildRoleBadge}>
              <Text style={styles.guildRoleText}>{t(`member.role.${member.role}`)}</Text>
            </View>
          )}
        </View>

        {/* Roller — yalnız GÖSTERİM. Atama B yarısında (rol ekranından). */}
        <Text style={styles.groupLabel}>{t('guildSettings.nav.roller')}</Text>
        <View style={styles.group}>
          {member.roles.length === 0 ? (
            <Text style={styles.emptyRow}>{t('guildSettings.roles.roleMembersEmpty')}</Text>
          ) : (
            member.roles.map((r) => (
              <View key={r.id} style={styles.roleRow}>
                <View style={[styles.dot, { backgroundColor: r.color }]} />
                <Text style={styles.roleName}>{r.name}</Text>
              </View>
            ))
          )}
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        {/* Ortam rolü — yalnız OWNER değiştirebilir; yetkisizde satır HİÇ render edilmez. */}
        {canChangeGuildRole && (
          <>
            <Text style={styles.groupLabel}>{t('member.actions.manageRoles')}</Text>
            <View style={styles.group}>
              <Pressable
                style={styles.actionRow}
                onPress={() =>
                  run(
                    () =>
                      guildsApi.setMemberRole(
                        guildId,
                        userId,
                        member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN',
                      ),
                    'reload',
                  )
                }
              >
                <Text style={styles.actionText}>
                  {member.role === 'ADMIN' ? t('member.role.MEMBER') : t('member.role.ADMIN')}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {canModerate && (
          <View style={styles.group}>
            <Pressable style={styles.actionRow} onPress={() => setPending('kick')}>
              <Text style={[styles.actionText, styles.danger]}>{t('member.actions.kick')}</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={styles.actionRow} onPress={() => setPending('ban')}>
              <Text style={[styles.actionText, styles.danger]}>{t('member.actions.ban')}</Text>
            </Pressable>
          </View>
        )}

        {canTransfer && (
          <View style={styles.group}>
            <Pressable style={styles.actionRow} onPress={() => setPending('transfer')}>
              <Text style={[styles.actionText, styles.danger]}>
                {t('member.actions.transferOwnership')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {pending === 'kick' && (
        <ConfirmDialog
          message={t('member.actions.kickConfirmMessage', { username: member.username })}
          confirmLabel={t('member.actions.kickConfirmButton')}
          loading={working}
          onConfirm={() => run(() => guildsApi.kickMember(guildId, userId), 'back')}
          onCancel={() => setPending(null)}
        />
      )}

      {pending === 'ban' && (
        <ConfirmDialog
          message={t('member.actions.banConfirmMessage', { username: member.username })}
          confirmLabel={t('member.actions.ban')}
          loading={working}
          onConfirm={() => run(() => guildsApi.banMember(guildId, userId), 'back')}
          onCancel={() => setPending(null)}
        />
      )}

      {/* 🔴 Sahiplik devri geri alınamaz — sözleşme §2.4 çift onay diyor: bu, ikinci onaydır
          (birincisi kırmızı satıra dokunmak), metin de sonucu açıkça yazıyor. */}
      {pending === 'transfer' && (
        <ConfirmDialog
          message={t('member.actions.transferConfirmMessage', { username: member.username })}
          confirmLabel={t('member.actions.transferOwnership')}
          loading={working}
          onConfirm={() => run(() => guildsApi.transferOwnership(guildId, userId), 'back')}
          onCancel={() => setPending(null)}
        />
      )}
    </View>
  );
}

const AVATAR = 88;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgContent,
    paddingHorizontal: theme.layout.panelGap,
  },
  body: {
    padding: theme.layout.panelGap,
    paddingBottom: theme.layout.panelGap * 2,
  },
  header: {
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.layout.panelGap,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.accentSubtle,
  },
  avatarLetter: {
    color: theme.colors.accent500,
    fontSize: 32,
    fontWeight: '700',
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  guildRoleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.accentSubtle,
  },
  guildRoleText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  groupLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 6,
  },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    overflow: 'hidden',
    marginBottom: 14,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: theme.layout.panelGap,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  roleName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
  },
  emptyRow: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.layout.panelGap,
  },
  actionRow: {
    minHeight: theme.layout.inputMinHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  danger: {
    color: theme.colors.danger,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderSubtle,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginBottom: 10,
  },
});
