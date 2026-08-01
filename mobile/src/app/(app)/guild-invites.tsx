import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { guildsApi, type InviteDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1e-B §3.7 — Davetler. **Aktif davet listesi + iptal + oluştur.**
 *
 * 🔴 Discord'un bu ekranındaki **"Davetleri Duraklat"** bizde YOK ve uydurulmadı: ortam düzeyinde
 * böyle bir bayrak/uç yok. Sahip "burayı sen seç" dediği için ekran, bizim gerçekten sahip
 * olduğumuz şeyin üstüne kuruldu.
 *
 * ⚠️ Listeleme `MANAGE_GUILD`, üretme `CREATE_INVITE` ister. Liste 403 alırsa **liste bölümü hiç
 * render edilmez**, "Davet Oluştur" durur — M1d-A'daki "listeleyemeyen ama üretebilen kullanıcı"
 * açık kalemi burada kapanıyor.
 *
 * Sunucu süresi dolmuş / hakkı bitmiş davetleri ZATEN eliyor (`invites.service.listInvites`);
 * istemci aynı süzgeci tekrar yazmaz, iki yerde ayrışır.
 */
export default function GuildInvitesScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const guildId = params.id;

  const [invites, setInvites] = useState<InviteDto[]>([]);
  const [canList, setCanList] = useState(true);
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<InviteDto | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    guildsApi
      .listInvites(guildId)
      .then((list) => {
        setInvites(list);
        setCanList(true);
        setState('ready');
      })
      .catch(() => {
        // Yetki yoksa liste yok — ama üretme hakkı olabilir; ekran hata ekranına düşmez.
        setCanList(false);
        setState('ready');
      });
  }, [guildId]);

  useFocusEffect(load);

  async function onCreate() {
    if (creating) return;
    setCreating(true);
    setErrorMessage('');
    try {
      const invite = await guildsApi.createInvite(guildId);
      setInvites((prev) => [invite, ...prev.filter((i) => i.code !== invite.code)]);
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke() {
    if (!revokeTarget) return;
    setWorking(true);
    try {
      await guildsApi.revokeInvite(revokeTarget.code);
      setInvites((prev) => prev.filter((i) => i.code !== revokeTarget.code));
      setRevokeTarget(null);
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
      setRevokeTarget(null);
    } finally {
      setWorking(false);
    }
  }

  async function copy(code: string) {
    await Clipboard.setStringAsync(code);
    setCopied(code);
  }

  /** Kullanım/süre özeti — sunucunun `null` değerleri "sınırsız/süresiz" demek. */
  function summary(invite: InviteDto): string {
    const uses = invite.maxUses ? `${invite.uses}/${invite.maxUses}` : String(invite.uses);
    if (!invite.expiresAt) return uses;
    const date = new Date(invite.expiresAt).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
    });
    return `${uses} · ${date}`;
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('guildSettings.nav.davetler') }} />

      <View style={styles.header}>
        <Pressable onPress={onCreate} disabled={creating} style={styles.createButton}>
          {creating ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <>
              <Ionicons name="add" size={18} color={theme.colors.textPrimary} />
              <Text style={styles.createText}>{t('invite.createButton')}</Text>
            </>
          )}
        </Pressable>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </View>

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'ready' && canList && invites.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('mobile.guildSettings.invitesEmpty')}</Text>
        </View>
      )}

      {state === 'ready' && canList && invites.length > 0 && (
        <FlatList
          data={invites}
          keyExtractor={(item) => item.code}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable style={styles.rowBody} onPress={() => copy(item.code)}>
                <Text style={styles.code}>{item.code}</Text>
                <Text style={styles.meta}>{summary(item)}</Text>
                {copied === item.code ? <Text style={styles.copied}>{t('invite.copied')}</Text> : null}
              </Pressable>
              <Pressable onPress={() => setRevokeTarget(item)} hitSlop={8} style={styles.revoke}>
                <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
              </Pressable>
            </View>
          )}
        />
      )}

      {revokeTarget && (
        <ConfirmDialog
          message={t('mobile.guildSettings.inviteRevokeConfirm', { code: revokeTarget.code })}
          confirmLabel={t('invite.revoke')}
          loading={working}
          onConfirm={onRevoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  header: { padding: theme.layout.panelGap, gap: 8 },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
  },
  createText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '700' },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  empty: { color: theme.colors.textMuted, fontSize: theme.fontSize.base, textAlign: 'center' },
  list: { paddingHorizontal: theme.layout.panelGap, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    marginBottom: 8,
  },
  rowBody: { flex: 1, minWidth: 0 },
  code: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    letterSpacing: 1,
  },
  meta: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
  copied: { color: theme.colors.accent500, fontSize: theme.fontSize.xs, marginTop: 2 },
  revoke: { padding: 4 },
});
