import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { formatMentionsPlain } from '@/utils/mentions';
import { t } from '@/i18n';
import { theme } from '@/theme';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  );
}

/**
 * Sprint M1h — **Sabitlenen Mesajlar** (kanal başına).
 *
 * M1d-C'de sabitleme aksiyonu bilinçle konmamıştı: sabitlenenleri görecek bir yüzey yokken
 * sabitlemek "görülemeyen sonuç" üretmek olurdu. Bu ekran o eksiği kapatıyor, aksiyon da onunla
 * birlikte açıldı.
 *
 * DM · grup DM · ortam kanalı — üçü de aynı uca bağlı (`GET /channels/:id/pins`), bu yüzden tek
 * ekran üçüne birden hizmet ediyor; kanal türüne göre ayrı ekran yok.
 *
 * Odaklanmada tazelenir: sabitleme paneli kapanıp buraya gelindiğinde liste güncel olsun (soket
 * `message.pinned` yayını da geliyor ama bu ekran mesaj store'una bağlı değil, kendi listesini
 * çekiyor — kaynak tek: sunucu).
 */
export default function PinsScreen() {
  const router = useRouter();
  /**
   * `origin` — sabitlenene dokununca hangi rotaya dönüleceği. DM mesajını kanal rotasında açmak
   * boş ekran demek olurdu; kanal türünü sunucudan yeniden sormaktansa çağıran ekran söylüyor.
   */
  const params = useLocalSearchParams<{ channelId: string; name?: string; origin?: 'dm' }>();
  const channelId = params.channelId;

  const [pins, setPins] = useState<MessageDto[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    if (!channelId) return;
    messagesApi
      .listPins(channelId)
      .then((list) => {
        setPins(list);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, [channelId]);

  useFocusEffect(load);

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('message.pinnedMessages') }} />

      {state === 'loading' ? (
        <ActivityIndicator color={theme.colors.accent500} style={styles.spinner} />
      ) : state === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={pins}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('message.pinnedMessagesEmpty')}</Text>}
          renderItem={({ item }) => (
            <Pressable
              // Dokunuş mesaja götürür + vurgular (M1g R1'de açılan `jumpTo` yolu). Sabitlenen
              // mesaj bağlamından koparılmış bir alıntı değil, sohbetteki yerine giden bir kapı.
              onPress={() =>
                router.push(
                  params.origin === 'dm'
                    ? {
                        pathname: '/dm/[id]',
                        params: { id: item.channelId, title: params.name ?? '', jumpTo: item.id },
                      }
                    : {
                        pathname: '/channel/[id]',
                        params: { id: item.channelId, name: params.name ?? '', jumpTo: item.id },
                      },
                )
              }
              style={styles.row}
            >
              <View style={styles.head}>
                <Text style={styles.author} numberOfLines={1}>
                  {item.author.username}
                </Text>
                <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.content} numberOfLines={4}>
                {formatMentionsPlain(item.content, () => undefined, t('mention.unknown'))}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  spinner: { marginTop: theme.layout.panelGap * 2 },
  center: { padding: theme.layout.panelGap * 1.5, alignItems: 'center', gap: 12 },
  list: { padding: theme.layout.panelGap, gap: 10 },
  row: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    padding: 12,
    gap: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  time: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  content: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, lineHeight: 19 },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginTop: theme.layout.panelGap,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm, textAlign: 'center' },
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
