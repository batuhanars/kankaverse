import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { discoveryApi, type DiscoveryGuildDto } from '@/api/discovery';
import { guildsApi } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { DiscoverGuildCard } from '@/components/discover/DiscoverGuildCard';
import { useDiscoveryJoin } from '@/components/discover/useDiscoveryJoin';
import { t } from '@/i18n';
import { theme } from '@/theme';

const DEBOUNCE_MS = 350;

// Sprint C18 §1 — mobil Keşfet. Yaş/ban kapıları ve `adultsOnly` süzmesi SUNUCUDA; bu ekran
// yalnız sonucu gösterir, ret olursa sunucunun Türkçe mesajını basar.
export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { joiningId, error: joinError, join, goToGuild } = useDiscoveryJoin();

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DiscoveryGuildDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Eski isteğin geç dönen yanıtı yeni aramanın sonucunu ezmesin.
  const requestSeq = useRef(0);
  const firstRun = useRef(true);

  // Zaten üye olunan ortamlar "Git" gösterir. Hata sessiz: liste gelmezse hepsi "Katıl" olur ve
  // sunucu ALREADY_MEMBER ile kullanıcıyı yine ortama götürür.
  useEffect(() => {
    guildsApi
      .list()
      .then((list) => setMemberIds(new Set(list.map((g) => g.id))))
      .catch(() => {});
  }, []);

  // Klavye: gerçek yükseklik olaydan okunur (sabit dolgu yok); liste sonu klavyenin altında kalmaz.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const load = useCallback((search: string) => {
    const seq = ++requestSeq.current;
    discoveryApi
      .listGuilds(search ? { search } : {})
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setItems(res.items);
        setCursor(res.nextCursor);
        setState('ready');
      })
      .catch((e) => {
        if (seq !== requestSeq.current) return;
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, []);

  // İlk açılışta hemen, sonra yazma bitince (debounce) istek.
  useEffect(() => {
    const delay = firstRun.current ? 0 : DEBOUNCE_MS;
    firstRun.current = false;
    const timer = setTimeout(() => load(query.trim()), delay);
    return () => clearTimeout(timer);
  }, [query, load]);

  function retry() {
    setState('loading');
    load(query.trim());
  }

  function loadMore() {
    if (!cursor || loadingMore || state !== 'ready') return;
    const seq = requestSeq.current;
    const search = query.trim();
    setLoadingMore(true);
    discoveryApi
      .listGuilds(search ? { search, cursor } : { cursor })
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setItems((prev) => [...prev, ...res.items]);
        setCursor(res.nextCursor);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  const bottomPad = Math.max(keyboardHeight, insets.bottom) + theme.layout.panelGap;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('mobile.discover.title') }} />

      <View style={styles.inputRow}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('mobile.discover.searchPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {joinError ? <Text style={styles.joinError}>{joinError}</Text> : null}

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage || t('discover.loadError')}</Text>
          <Pressable onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {state === 'ready' && items.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('discover.empty')}</Text>
        </View>
      )}

      {state === 'ready' && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(g) => g.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={theme.colors.accent500} style={styles.more} /> : null
          }
          renderItem={({ item }) => (
            <DiscoverGuildCard
              guild={item}
              isMember={memberIds.has(item.id)}
              joining={joiningId === item.id}
              disabled={joiningId !== null}
              onJoin={() => void join(item.id)}
              onGo={() => goToGuild(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: theme.layout.panelGap,
    marginBottom: 8,
    paddingHorizontal: 12,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
  },
  list: { paddingHorizontal: theme.layout.panelGap, paddingTop: 8, gap: 12 },
  more: { paddingVertical: 12 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap,
    gap: 8,
  },
  joinError: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.layout.panelGap,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm, textAlign: 'center' },
  empty: { color: theme.colors.textSecondary, fontSize: theme.fontSize.base, textAlign: 'center' },
  retryButton: {
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
});
