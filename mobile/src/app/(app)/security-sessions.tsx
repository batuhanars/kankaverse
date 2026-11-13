import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi, type SessionDto } from '@/api/auth';
import { extractErrorMessage } from '@/api/errors';
import { mobileParkedApi, type ParkedDevice } from '@/e2ee/mobileApi';
import { useAuthStore } from '@/stores/auth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** Tarih/saat TR formatı (kök CLAUDE.md i18n kuralı): "25 Ekim 2023 18.42". */
function formatSeen(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  );
}

const platformLabel = (p: string) =>
  p === 'android' ? t('security.sessions.parkedAndroid') : t('security.sessions.parkedDesktop');

/**
 * Sprint M1f §2.4 — Oturumlarım.
 *
 * Sunucu yalnız **kendi** oturumlarını döner ve mevcut olanı kendisi işaretler (`current`) — istemci
 * "hangisi benim" tahmininde bulunmaz.
 *
 * Mevcut oturumu kapatmak = çıkış: ekran bunu ayrı bir "çıkış" yolu icat etmeden, tokenları temizleyip
 * giriş ekranına giderek yapar. Aksi hâlde uygulama iptal edilmiş bir tokenla ayakta kalırdı.
 */
export default function SecuritySessionsScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOthers, setConfirmOthers] = useState(false);
  // C69: çıkış yapılmış (park) şifreleme cihazları. E2EE kapalıysa (404 E2EE_DISABLED) ya da yükleme
  // başarısızsa bölüm görünmez; ekranın asıl işi (oturumlar) bundan etkilenmez.
  const [parked, setParked] = useState<ParkedDevice[]>([]);
  const [parkedToRemove, setParkedToRemove] = useState<ParkedDevice | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  const loadParked = useCallback(() => {
    mobileParkedApi
      .list()
      .then((res) => setParked(res.data))
      .catch(() => setParked([]));
  }, []);

  const load = useCallback(() => {
    setState('loading');
    authApi
      .getSessions()
      .then((list) => {
        setSessions(list);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, []);

  useFocusEffect(load);
  useFocusEffect(loadParked);

  async function onRemoveParked() {
    const target = parkedToRemove;
    if (!target) return;
    setRemoving(true);
    setRemoveError('');
    try {
      await mobileParkedApi.remove(target.id);
      setParked((prev) => prev.filter((d) => d.id !== target.id));
      setParkedToRemove(null);
    } catch (e) {
      setRemoveError(extractErrorMessage(e));
    } finally {
      setRemoving(false);
    }
  }

  async function onRevoke(session: SessionDto) {
    if (busy) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await authApi.revokeSession(session.id);
      if (session.current) {
        // Kendi oturumunu kapattı: token artık geçersiz, uygulamada kalmanın anlamı yok.
        await logout();
        router.replace('/login');
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeOthers() {
    setConfirmOthers(false);
    setBusy(true);
    setErrorMessage('');
    try {
      await authApi.revokeOtherSessions();
      setSessions((prev) => prev.filter((s) => s.current));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const hasOthers = sessions.some((s) => !s.current);

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('security.sessions.title') }} />

      {state === 'loading' ? (
        <ActivityIndicator color={theme.colors.textMuted} style={styles.spinner} />
      ) : state === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('security.sessions.noSessions')}</Text>}
          ListFooterComponent={
            <>
              {hasOthers ? (
                <Pressable
                  onPress={() => setConfirmOthers(true)}
                  disabled={busy}
                  style={[styles.othersButton, busy && styles.disabled]}
                >
                  <Text style={styles.othersText}>{t('security.sessions.terminateOthers')}</Text>
                </Pressable>
              ) : null}
              {parked.map((device) => (
                <View key={device.id} style={[styles.row, styles.parkedRow]}>
                  <Text style={styles.parkedText}>
                    {t('security.sessions.parkedRow', {
                      platform: platformLabel(device.platform),
                      date: formatSeen(device.lastSeenAt),
                    })}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setRemoveError('');
                      setParkedToRemove(device);
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.terminate}>{t('security.sessions.parkedRemove')}</Text>
                  </Pressable>
                </View>
              ))}
            </>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Ionicons
                name={item.current ? 'phone-portrait' : 'phone-portrait-outline'}
                size={20}
                color={item.current ? theme.colors.accent500 : theme.colors.textSecondary}
              />
              <View style={styles.rowBody}>
                <Text style={styles.device} numberOfLines={1}>
                  {item.device ?? t('security.sessions.unknown')}
                  {item.current ? ` · ${t('security.sessions.current')}` : ''}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {t('security.sessions.lastActive')}: {formatSeen(item.lastActiveAt)}
                  {item.ip ? ` · ${item.ip}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => onRevoke(item)} disabled={busy} hitSlop={8}>
                <Text style={[styles.terminate, busy && styles.disabled]}>
                  {t('security.sessions.terminate')}
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}

      {errorMessage && state === 'ready' ? <Text style={styles.inlineError}>{errorMessage}</Text> : null}

      {/* ConfirmDialog `visible` prop'u almaz, KOŞULLU mount edilir (mevcut 6 kullanımın deseni). */}
      {confirmOthers ? (
        <ConfirmDialog
          title={t('security.sessions.terminateOthers')}
          message={t('mobile.security.terminateOthersConfirm')}
          confirmLabel={t('security.sessions.terminateOthers')}
          loading={busy}
          onConfirm={onRevokeOthers}
          onCancel={() => setConfirmOthers(false)}
        />
      ) : null}
      {parkedToRemove ? (
        <ConfirmDialog
          title={t('security.sessions.parkedRemoveTitle')}
          message={removeError || t('security.sessions.parkedRemoveConfirm')}
          confirmLabel={t('security.sessions.parkedRemove')}
          loading={removing}
          onConfirm={onRemoveParked}
          onCancel={() => setParkedToRemove(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  spinner: { marginTop: theme.layout.panelGap * 2 },
  center: { padding: theme.layout.panelGap * 1.5, alignItems: 'center', gap: 12 },
  list: { padding: theme.layout.panelGap * 1.5, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    padding: 12,
  },
  rowBody: { flex: 1, gap: 2 },
  device: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  meta: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  terminate: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  parkedRow: { marginTop: 0 },
  parkedText: { flex: 1, color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  disabled: { opacity: 0.5 },
  othersButton: {
    marginTop: 6,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  othersText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginTop: theme.layout.panelGap,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm, textAlign: 'center' },
  inlineError: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.layout.panelGap * 1.5,
    paddingBottom: theme.layout.panelGap,
  },
  retry: {
    paddingHorizontal: 16,
    minHeight: theme.layout.inputMinHeight,
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  retryText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
});
