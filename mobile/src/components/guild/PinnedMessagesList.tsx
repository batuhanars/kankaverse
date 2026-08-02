import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { MessagePreviewRow } from './MessagePreviewRow';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1h `pins.tsx` ekranının içeriğinden çıkarıldı (Sprint M2c contract §4.3 — kanal detay
 * "Sabitlemeler" sekmesi AYNI içeriği kullanır, kopyalanmaz). `pins.tsx` artık bu bileşeni saran
 * ince bir kabuk; davranış (odaklanmada tazelenme, yükleniyor/hata/boş durumları) DEĞİŞMEDİ.
 *
 * Navigasyon çağırana bırakıldı (`onOpenMessage`) — `pins.tsx` DM/kanal ayrımını `origin` param'ından
 * çözüp kendi rotasına gider, kanal detay sekmesi her zaman kanal ekranına gider (bu sekme yalnız
 * ortam kanallarında açılıyor, DM'de channel-details rotası yok).
 */
interface Props {
  channelId: string;
  onOpenMessage: (message: MessageDto) => void;
}

export function PinnedMessagesList({ channelId, onOpenMessage }: Props) {
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

  // Odaklanmada tazelenir: sabitleme paneli kapanıp buraya (veya kanal detayına) gelindiğinde liste
  // güncel olsun. Kanal detayında bu sekme yalnız `activeTab === 'pins'` iken mount edildiği için
  // "odaklanma" burada "sekme açılışı" ile örtüşür — ayrı bir tetikleyici gerekmiyor.
  useFocusEffect(load);

  if (state === 'loading') {
    return <ActivityIndicator color={theme.colors.accent500} style={styles.spinner} />;
  }

  if (state === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{errorMessage}</Text>
        <Pressable onPress={load} style={styles.retry}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={pins}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>{t('message.pinnedMessagesEmpty')}</Text>}
      renderItem={({ item }) => (
        <MessagePreviewRow message={item} numberOfLines={4} onPress={() => onOpenMessage(item)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  spinner: { marginTop: theme.layout.panelGap * 2 },
  center: { padding: theme.layout.panelGap * 1.5, alignItems: 'center', gap: 12 },
  list: { padding: theme.layout.panelGap, gap: 10 },
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
