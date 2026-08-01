import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { MessageBubble } from './MessageBubble';
import { MessageSearchModal } from './MessageSearchModal';
import { useMessagesStore } from '@/stores/messages';
import { useTypingStore } from '@/stores/typing';
import { useAuthStore } from '@/stores/auth';
import {
  emitTypingStart,
  emitTypingStop,
  joinChannel,
  leaveChannel,
  setActiveChannel,
} from '@/realtime/socket';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Aramadan "gidiyor" sonrası kaç sayfa daha eskiye gidilir — sınırsız değil (uzak/temizlenmiş
// mesaj için sonsuz döngü olmaz), bkz. jump-to-message effect'i.
const MAX_JUMP_FETCH_ATTEMPTS = 20;

type LoadState = 'loading' | 'error' | 'ready';

// zustand + React 19 `useSyncExternalStore` tuzağı: selector her çağrıda YENİ bir `[]` dönerse
// (ör. `s.byChannel[id] ?? []`), React "getSnapshot should be cached" kabul edip sonsuz render
// döngüsüne girer ("Maximum update depth exceeded" — emülatörde canlı görüldü, bu sabit onu
// düzeltiyor). Kanalda hiç "yazıyor" yoksa hep AYNI boş dizi referansı dönülür.
const EMPTY_TYPING_USERS: { userId: string; username: string }[] = [];

interface RenderItem {
  message: MessageDto;
  showAuthor: boolean;
}

function buildRenderItems(messages: MessageDto[]): RenderItem[] {
  const FIVE_MIN = 5 * 60 * 1000;
  return messages.map((message, idx) => {
    const prev = messages[idx - 1];
    const showAuthor =
      !prev ||
      prev.author.id !== message.author.id ||
      new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > FIVE_MIN;
    return { message, showAuthor };
  });
}

interface Props {
  channelId: string;
  placeholder: string;
  markRead: (channelId: string) => Promise<unknown>;
  typingMode: 'named' | 'simple';
  // T&S — DM engelli/izinsizse sunucu göndermede 403 döner; ama giriş kutusunu baştan devre dışı
  // bırakmak için sidebar'dan taşınan bilgi (contract §6 — sessizce gizlenmez, neden gösterilir).
  disabledNotice?: string | null;
  // Sözleşme §3.6 — DM'e özel başlık ikonları (Sohbeti Temizle / Grup Yönetimi). Kanal ekranında
  // yok (undefined). Arama ikonu HER İKİ ekranda ortak olduğu için burada, MessageScreen'in kendi
  // headerRight'ına eklenir — tek `<Stack.Screen>` headerRight sahibi bu bileşen (birden fazla
  // bileşenin aynı route için headerRight yazması güvenilmez sırayla ezilir).
  headerActions?: ReactNode;
}

// Sprint M1a — kanal VE DM mesaj ekranı için TEK gövde (contract §5 ekran 3: "aynısı"). İkisi de
// aynı REST/WS yüzeyini kullanır (`/channels/:id/messages` — DM kanalı da bir Channel satırıdır);
// yalnız "okundu" ucu ve başlık farklı, onlar çağıran route'tan gelir.
export function MessageScreen({ channelId, placeholder, markRead, typingMode, disabledNotice, headerActions }: Props) {
  const authUser = useAuthStore((s) => s.user);
  const channelState = useMessagesStore((s) => s.byChannel[channelId]);
  const fetchInitial = useMessagesStore((s) => s.fetchInitial);
  const fetchOlder = useMessagesStore((s) => s.fetchOlder);
  const appendMessage = useMessagesStore((s) => s.appendMessage);
  const seedKnownUser = useMessagesStore((s) => s.seedKnownUser);
  const resolveUsername = useMessagesStore((s) => s.resolveUsername);
  const typingUsers = useTypingStore((s) => s.byChannel[channelId] ?? EMPTY_TYPING_USERS);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const isTypingRef = useRef(false);
  const typingRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Alta yapışma + "yeni mesaj" sayacı — web `MessageArea.vue` REV-1/REV-9 semantiğinin birebir
  // karşılığı: dipten `STICK_THRESHOLD` içindeysem yeni mesajda otomatik kay; yukarıda geçmiş
  // okuyorsam kaydırma, geleni say ve "aşağı in" düğmesinde göster. Kendi mesajım her koşulda dibe
  // kaydırır ve SAYILMAZ. Fark: liste `inverted`, yani dip = offset 0 (web'de scrollHeight'tı).
  const listRef = useRef<FlatList<RenderItem>>(null);
  const atBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const [newMessageCount, setNewMessageCount] = useState(0);

  // Sözleşme §3.5 — sohbet içi mesaj arama + "sonuca dokununca o mesaja git". `highlightId` hedef
  // henüz yüklü sayfada değilse `fetchOlder` ile geriye doğru arar (sınırlı deneme — bkz.
  // MAX_JUMP_FETCH_ATTEMPTS); bulamazsa sessizce bırakır (kontrat alternatifi: "ya da o kanala düşüyor" —
  // kullanıcı zaten bu kanalda kalır).
  const [searchVisible, setSearchVisible] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const jumpAttemptsRef = useRef(0);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // react-hooks/set-state-in-effect — GuildsScreen (M0) deseni: effect gövdesi fetch'i DOĞRUDAN
  // (adlandırılmış bir sarmalayıcı fonksiyonu çağırmadan) inline zincirler; setState yalnız
  // .then/.catch içinde (asenkron) çalışır. `fetchMessages` yalnız effect DIŞI iki yer için var:
  // reconnect refetch (realtime/socket.ts'e closure olarak verilir, sonradan async çağrılır) ve
  // "tekrar dene" butonu (kullanıcı olayı, effect değil).
  const fetchMessages = useCallback(async () => {
    try {
      await fetchInitial(channelId);
      setLoadState('ready');
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
      setLoadState('error');
    }
  }, [channelId, fetchInitial]);

  function retryLoad() {
    setLoadState('loading');
    fetchMessages();
  }

  useEffect(() => {
    let cancelled = false;
    fetchInitial(channelId)
      .then(() => {
        if (!cancelled) setLoadState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMessage(extractErrorMessage(e));
        setLoadState('error');
      });

    markRead(channelId).catch(() => {});
    // contract §4.3 — reconnect sonrası bu kanalın mesajları yeniden çekilir (boşluk bırakmaz).
    setActiveChannel(channelId, () => {
      fetchMessages();
    });
    joinChannel(channelId).then((ack) => {
      if (__DEV__ && !ack.ok) console.warn('[MessageScreen] join başarısız:', ack.error);
    });

    return () => {
      cancelled = true;
      setActiveChannel(null);
      leaveChannel(channelId);
      if (typingRefreshTimer.current) clearTimeout(typingRefreshTimer.current);
      if (isTypingRef.current) emitTypingStop(channelId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    if (authUser) seedKnownUser(channelId, authUser.id, authUser.username);
  }, [authUser, channelId, seedKnownUser]);

  const items = useMemo(() => buildRenderItems(channelState?.messages ?? []), [channelState?.messages]);
  const inverted = useMemo(() => [...items].reverse(), [items]);

  function scrollToBottom() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }

  function jumpToBottom() {
    atBottomRef.current = true;
    setNewMessageCount(0);
    scrollToBottom();
  }

  // Kanal değişince sayaç/yapışma sıfırlanır — önceki kanalın sayacı yeni kanala taşınmasın.
  useEffect(() => {
    atBottomRef.current = true;
    prevCountRef.current = 0;
    setNewMessageCount(0);
  }, [channelId]);

  useEffect(() => {
    const count = items.length;
    const prev = prevCountRef.current;
    prevCountRef.current = count;
    // Geçmiş yükleme (prepend) sayıyı da artırır ama BAŞTAN ekler; dipteki konum değişmediği için
    // kaydırma/sayma yapılmaz. Ayırt etme: yeni mesaj her zaman SON eleman olur ve ilk yüklemede
    // prev=0 olur (o da sayılmaz, zaten dipteyiz).
    if (count <= prev || prev === 0) return;
    const last = items[count - 1].message;
    const mine = last.author.id === authUser?.id;
    if (loadingOlder) return;
    if (atBottomRef.current || mine) {
      setNewMessageCount(0);
      scrollToBottom();
    } else {
      setNewMessageCount((n) => n + (count - prev));
    }
  }, [items, authUser?.id, loadingOlder]);

  function requestJump(messageId: string) {
    setSearchVisible(false);
    jumpAttemptsRef.current = 0;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightId(messageId);
  }

  // Hedef mesaj yüklü sayfada bulununca kaydır + geçici vurgu; bulunmuyorsa (henüz geçmişte)
  // bir sayfa daha eskiye çek ve bu effect'in kendisi (inverted/hasMore/loadingOlder bağımlılıkları
  // yeniden çalıştırır) tekrar kontrol eder — zincirleme "aranıyor" hâli budur.
  useEffect(() => {
    if (!highlightId) return;
    const idx = inverted.findIndex((it) => it.message.id === highlightId);
    if (idx !== -1) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.4 });
      });
      highlightTimerRef.current = setTimeout(() => setHighlightId(null), 2500);
      return;
    }
    if (loadingOlder) return;
    if (channelState?.hasMore && jumpAttemptsRef.current < MAX_JUMP_FETCH_ATTEMPTS) {
      jumpAttemptsRef.current += 1;
      setLoadingOlder(true);
      fetchOlder(channelId).finally(() => setLoadingOlder(false));
    } else {
      // Ulaşılamadı (temizlenmiş/çok eski) — kontrat alternatifi: kullanıcı zaten bu kanalda kalır.
      setHighlightId(null);
    }
  }, [highlightId, inverted, channelState?.hasMore, loadingOlder, channelId, fetchOlder]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  function scheduleTypingRefresh() {
    if (typingRefreshTimer.current) clearTimeout(typingRefreshTimer.current);
    typingRefreshTimer.current = setTimeout(() => {
      if (isTypingRef.current) {
        emitTypingStart(channelId);
        scheduleTypingRefresh();
      }
    }, 3000);
  }

  function onChangeInput(text: string) {
    setInput(text);
    if (!isTypingRef.current && text.length > 0) {
      isTypingRef.current = true;
      emitTypingStart(channelId);
      scheduleTypingRefresh();
    } else if (isTypingRef.current && text.length === 0) {
      isTypingRef.current = false;
      if (typingRefreshTimer.current) clearTimeout(typingRefreshTimer.current);
      emitTypingStop(channelId);
    }
  }

  async function onSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError('');
    isTypingRef.current = false;
    if (typingRefreshTimer.current) clearTimeout(typingRefreshTimer.current);
    emitTypingStop(channelId);
    try {
      const message = await messagesApi.send(channelId, trimmed);
      appendMessage(message);
      setInput('');
    } catch (e) {
      setSendError(extractErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  // Web'deki 120px eşiğinin aynısı (`MessageArea.vue` onListScroll). Inverted listede dip offset 0.
  const STICK_THRESHOLD = 120;

  function onListScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    atBottomRef.current = e.nativeEvent.contentOffset.y < STICK_THRESHOLD;
    if (atBottomRef.current && newMessageCount > 0) setNewMessageCount(0);
  }

  function onEndReached() {
    if (loadState !== 'ready' || loadingOlder || !channelState?.hasMore) return;
    setLoadingOlder(true);
    fetchOlder(channelId).finally(() => setLoadingOlder(false));
  }

  function typingLabel(): string | null {
    if (typingUsers.length === 0) return null;
    if (typingMode === 'simple') return t('typing.simple');
    if (typingUsers.length === 1) return t('typing.one', { user: typingUsers[0].username });
    if (typingUsers.length === 2) {
      return t('typing.two', { user1: typingUsers[0].username, user2: typingUsers[1].username });
    }
    return t('typing.many');
  }

  const label = typingLabel();

  // 🔴 Alt boşluk TEK bir yerde hesaplanır: `max(klavye yüksekliği, gezinme çubuğu payı)`.
  //
  // İki ayrı sahip bulgusu (2026-08-01, ÜÇ TUŞLU gezinmeli ikinci cihaz) aynı köke çıkıyordu:
  //  (1) klavye kapalıyken mesaj kutusu gezinme tuşlarının arkasında kalıyordu,
  //  (2) klavye açılınca kutu klavyeyle birlikte doğru kaymıyordu.
  // Sebep SDK 54'te edge-to-edge'in varsayılan AÇIK olması: uygulama pencerenin tamamına, gezinme
  // çubuğunun da ALTINA çiziyor. Jest gezinmeli cihazda (sahibin telefonu) alttaki şerit ince
  // olduğu için ikisi de görünmüyordu.
  //
  // `KeyboardAvoidingView` KALDIRILDI: Android'de yüksekliği görünüm çerçevesi ile klavyenin ekran
  // koordinatının farkından türetiyor ve bu fark edge-to-edge'de cihazın gezinme türüne göre
  // değişiyor — yani doğruluğu cihaza bağlıydı. Android'in IME inset'i klavye görünürken gezinme
  // çubuğu alanını ZATEN kapsar (çubuk klavyenin üstüne çizilir), dolayısıyla ikisini toplamak
  // yanlış olur; büyük olanı almak iki gezinme türünde de doğrudur:
  //   • klavye kapalı → `insets.bottom` (jest ~24dp, üç tuşlu ~48dp)
  //   • klavye açık   → klavye yüksekliği (gezinme payını zaten içerir)
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const bottomInset = Math.max(keyboardHeight, insets.bottom);

  // Alt boşluk KAPSAYICIDA: mesaj listesi de klavye/gezinme kadar kısalır, giriş kutusu her zaman
  // görünür alanın en altında kalır. (Önceki `KeyboardAvoidingView behavior="padding"` aynı işi
  // yapmaya çalışıyordu ama yüksekliği cihaza göre değişiyordu — bkz. yukarıdaki hesap.)
  return (
    <View style={[styles.flex, { paddingBottom: bottomInset }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActionsRow}>
              {headerActions}
              <Pressable
                onPress={() => setSearchVisible(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('common.search')}
              >
                <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          ),
        }}
      />

      {loadState === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {loadState === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable onPress={retryLoad} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {loadState === 'ready' && items.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('message.noMessages')}</Text>
        </View>
      )}

      {loadState === 'ready' && items.length > 0 && (
        <FlatList
          ref={listRef}
          data={inverted}
          keyExtractor={(item) => item.message.id}
          inverted
          contentContainerStyle={styles.list}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          onScrollToIndexFailed={(info) => {
            // Değişken yükseklikli mesaj satırlarında scrollToIndex ilk denemede başarısız olabilir
            // (RN bilinen sınırı) — kısa gecikmeyle tekrar dene.
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.4 });
            }, 60);
          }}
          ListFooterComponent={
            loadingOlder ? <ActivityIndicator color={theme.colors.textMuted} style={styles.loadMore} /> : null
          }
          renderItem={({ item }) => (
            <MessageBubble
              message={item.message}
              showAuthor={item.showAuthor}
              isMine={item.message.author.id === authUser?.id}
              resolveMention={(id) => resolveUsername(channelId, id)}
              highlighted={item.message.id === highlightId}
            />
          )}
        />
      )}

      {/* "Aşağı in" düğmesi — yalnız yukarıda geçmiş okurken yeni mesaj geldiyse görünür (web
          MessageArea.vue REV-9 karşılığı). Boş yüzey değil: sayaç sıfırken hiç render edilmez. */}
      {newMessageCount > 0 && (
        <Pressable onPress={jumpToBottom} style={styles.newMessagePill}>
          <Text style={styles.newMessagePillCount}>
            {newMessageCount > 99 ? '99+' : newMessageCount}
          </Text>
          <Text style={styles.newMessagePillText}>{t('message.newMessages')}</Text>
          <Ionicons name="arrow-down" size={14} color={theme.colors.textPrimary} />
        </Pressable>
      )}

      {label && (
        <View style={styles.typingRow}>
          <Text style={styles.typingText}>{label}</Text>
        </View>
      )}

      {disabledNotice ? (
        <View style={styles.disabledBar}>
          <Text style={styles.disabledText}>{disabledNotice}</Text>
        </View>
      ) : (
        <View style={styles.inputBar}>
          {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={onChangeInput}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              multiline
            />
            <Pressable
              onPress={onSend}
              disabled={!input.trim() || sending}
              style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
            >
              <Text style={styles.sendButtonText}>{t('message.send')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {searchVisible && (
        <MessageSearchModal channelId={channelId} onClose={() => setSearchVisible(false)} onJump={requestJump} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginRight: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
    marginBottom: theme.layout.panelGap,
  },
  retryButton: {
    minHeight: theme.layout.control,
    paddingHorizontal: theme.layout.panelGap,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
  list: {
    paddingVertical: theme.layout.panelGap,
  },
  loadMore: {
    marginVertical: 10,
  },
  newMessagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.accent500,
  },
  newMessagePillCount: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  newMessagePillText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  typingRow: {
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 4,
  },
  typingText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontStyle: 'italic',
  },
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    padding: theme.layout.panelGap,
  },
  sendError: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: theme.layout.inputMinHeight,
    maxHeight: 120,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: theme.fontSize.base,
  },
  sendButton: {
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  disabledBar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    padding: theme.layout.panelGap,
  },
  disabledText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
});
