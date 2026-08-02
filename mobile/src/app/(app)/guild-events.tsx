import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { eventsApi, type EventDto } from '@/api/events';
import { extractErrorMessage } from '@/api/errors';
import { EventCard } from '@/components/guild/EventCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useGuildPermission } from '@/hooks/useGuildPermission';
import { t } from '@/i18n';
import { theme } from '@/theme';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Sprint M1j §3.2 — Etkinlikler ekranı. Ortam aksiyon şeridindeki takvim düğmesinden açılır.
 *
 * Liste **her odaklanmada** tazelenir (`useFocusEffect`) — form ekranından dönüldüğünde güncel
 * gelsin diye. Store yok, `guild.event_*` WS dinlemesi yok (sözleşme §1 OUT): tek ekranın
 * durumunu paylaşan kimse yok, açılışta fetch yeterli.
 *
 * `MANAGE_EVENTS` yalnız **UX** kapısıdır — otorite sunucuda. İzin bilinemezse yokmuş gibi
 * davranılır (`useGuildPermission` doktrini); 403 gelirse sunucunun Türkçe mesajı gösterilir.
 */
export default function GuildEventsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guildId: string }>();
  const canManage = useGuildPermission(params.guildId, 'MANAGE_EVENTS');

  const [state, setState] = useState<LoadState>('loading');
  const [events, setEvents] = useState<EventDto[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(() => {
    eventsApi
      .listByGuild(params.guildId)
      .then((list) => {
        setEvents(list);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, [params.guildId]);

  useFocusEffect(fetchAll);

  function openForm(eventId?: string) {
    setMenuId(null);
    router.push({
      pathname: '/event-form',
      params: eventId ? { guildId: params.guildId, eventId } : { guildId: params.guildId },
    });
  }

  /**
   * İyimser toggle: sayaç ve işaret anında döner, sunucunun döndüğü DTO ile üstüne yazılır
   * (sayacın otoritesi sunucu). Hata → kart eski hâline geri alınır.
   */
  async function toggleInterest(target: EventDto) {
    setActionError('');
    const optimistic: EventDto = {
      ...target,
      interestedByMe: !target.interestedByMe,
      interestedCount: target.interestedCount + (target.interestedByMe ? -1 : 1),
    };
    setEvents((list) => list.map((e) => (e.id === target.id ? optimistic : e)));
    try {
      const updated = target.interestedByMe
        ? await eventsApi.removeInterest(target.id)
        : await eventsApi.addInterest(target.id);
      setEvents((list) => list.map((e) => (e.id === target.id ? updated : e)));
    } catch (e) {
      setEvents((list) => list.map((item) => (item.id === target.id ? target : item)));
      setActionError(extractErrorMessage(e));
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    setDeleting(true);
    setActionError('');
    try {
      await eventsApi.remove(target.id);
      setEvents((list) => list.filter((e) => e.id !== target.id));
      setDeleteTarget(null);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: t('event.sidebarLabel'),
          headerRight: canManage
            ? () => (
                <Pressable onPress={() => openForm()} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.headerAction}>{t('event.create')}</Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable
            onPress={() => {
              setState('loading');
              fetchAll();
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {state === 'ready' && (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            actionError ? <Text style={styles.error}>{actionError}</Text> : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="calendar-outline" size={40} color={theme.colors.textMuted} />
              <Text style={styles.empty}>{t('event.empty')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <EventCard
              event={item}
              canManage={canManage}
              menuOpen={menuId === item.id}
              onToggleMenu={() => setMenuId(menuId === item.id ? null : item.id)}
              onToggleInterest={() => toggleInterest(item)}
              onEdit={() => openForm(item.id)}
              onDelete={() => {
                setMenuId(null);
                setDeleteTarget(item);
              }}
            />
          )}
        />
      )}

      {deleteTarget ? (
        <ConfirmDialog
          title={t('event.deleteTitle')}
          message={t('event.deleteConfirm', { name: deleteTarget.name })}
          confirmLabel={t('event.deleteButton')}
          loading={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  list: { padding: theme.layout.panelGap, gap: 12, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  empty: { color: theme.colors.textMuted, fontSize: theme.fontSize.base, textAlign: 'center' },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm, textAlign: 'center' },
  retryButton: {
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 20,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
  headerAction: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
});
