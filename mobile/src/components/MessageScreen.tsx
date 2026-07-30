import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { MessageBubble } from './MessageBubble';
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
}

// Sprint M1a — kanal VE DM mesaj ekranı için TEK gövde (contract §5 ekran 3: "aynısı"). İkisi de
// aynı REST/WS yüzeyini kullanır (`/channels/:id/messages` — DM kanalı da bir Channel satırıdır);
// yalnız "okundu" ucu ve başlık farklı, onlar çağıran route'tan gelir.
export function MessageScreen({ channelId, placeholder, markRead, typingMode, disabledNotice }: Props) {
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

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          data={inverted}
          keyExtractor={(item) => item.message.id}
          inverted
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          ListFooterComponent={
            loadingOlder ? <ActivityIndicator color={theme.colors.textMuted} style={styles.loadMore} /> : null
          }
          renderItem={({ item }) => (
            <MessageBubble
              message={item.message}
              showAuthor={item.showAuthor}
              isMine={item.message.author.id === authUser?.id}
              resolveMention={(id) => resolveUsername(channelId, id)}
            />
          )}
        />
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
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
