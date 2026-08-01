import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { guildsApi, type AuditLogEntryDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1e-B §3.8 — Denetim Kaydı. Cursor'lu (`before`) sonsuz liste.
 *
 * 🔴 **Filtre YOK** (Discord'da var): sunucuda filtre ucu yok ve istemci tarafında süzmek
 * yanıltıcı olur — kullanıcı "hepsini süzdüm" sanır, oysa yalnız yüklenmiş sayfada arar.
 *
 * Aksiyon metinleri `audit.action.*` anahtarlarından. Sunucu `guild.member_kicked` gibi
 * ön-ekli gönderiyor, anahtar son parçadır; bilinmeyen aksiyonda `fallback` kullanılır —
 * yeni bir aksiyon eklendiğinde ekran ham anahtar basmaz.
 */
export default function GuildAuditScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const guildId = params.id;

  const [entries, setEntries] = useState<AuditLogEntryDto[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      guildsApi
        .listAuditLogs(guildId)
        .then((list) => {
          setEntries(list);
          setExhausted(list.length === 0);
          setState('ready');
        })
        .catch((e) => {
          setErrorMessage(extractErrorMessage(e));
          setState('error');
        });
    }, [guildId]),
  );

  async function loadMore() {
    if (loadingMore || exhausted || entries.length === 0) return;
    setLoadingMore(true);
    try {
      const older = await guildsApi.listAuditLogs(guildId, entries[entries.length - 1].id);
      if (older.length === 0) setExhausted(true);
      else setEntries((prev) => [...prev, ...older]);
    } catch {
      // Sessiz: ilk sayfa ekranda duruyor, sayfalama hatası ekranı boşaltmamalı.
    } finally {
      setLoadingMore(false);
    }
  }

  function describe(entry: AuditLogEntryDto): string {
    const key = entry.action.split('.').pop() ?? 'fallback';
    const actor = entry.actor?.username ?? '';
    const target = entry.targetUser?.username ?? '';
    const text = t(`audit.action.${key}`, { actor, target });
    // `t()` eksik anahtarda yolun kendisini döner — o durumda jenerik metne düşülür.
    return text.startsWith('audit.action.') ? t('audit.action.fallback', { actor }) : text;
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('audit.title') }} />

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage || t('audit.error')}</Text>
        </View>
      )}

      {state === 'ready' && entries.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('audit.empty')}</Text>
        </View>
      )}

      {state === 'ready' && entries.length > 0 && (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={styles.subtitle}>{t('audit.subtitle')}</Text>}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={theme.colors.textMuted} style={styles.more} /> : null
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.text}>{describe(item)}</Text>
              {item.reason ? (
                <Text style={styles.reason}>{t('audit.reason', { reason: item.reason })}</Text>
              ) : null}
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm, textAlign: 'center' },
  empty: { color: theme.colors.textMuted, fontSize: theme.fontSize.base, textAlign: 'center' },
  list: { padding: theme.layout.panelGap, paddingBottom: 24 },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    marginBottom: 12,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: theme.layout.panelGap,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    marginBottom: 8,
  },
  text: { color: theme.colors.textPrimary, fontSize: theme.fontSize.sm, lineHeight: 20 },
  reason: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 4 },
  date: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 6 },
  more: { marginVertical: 10 },
});
