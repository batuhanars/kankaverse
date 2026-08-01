import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { extractErrorMessage } from '@/api/errors';
import { MessageBubble } from './MessageBubble';
import { MessageSearchModal } from './MessageSearchModal';
import { MessageComposer } from './message/MessageComposer';
import { useTypingEmitter } from './message/useTypingEmitter';
import { useMessageComposer } from './message/useMessageComposer';
import { useMessageListController } from './message/useMessageListController';
import { MessageEmpty, MessageError, MessageLoading } from './message/MessageStates';
import { MessageActionHost } from './message/MessageActionHost';
import { useMessageActions } from './message/useMessageActions';
import { useMessagesStore } from '@/stores/messages';
import { useAuthStore } from '@/stores/auth';
import { joinChannel, leaveChannel, setActiveChannel } from '@/realtime/socket';
import { t } from '@/i18n';
import { theme } from '@/theme';

type LoadState = 'loading' | 'error' | 'ready';

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
  /**
   * Sprint M1g R1 — ekran açılır açılmaz bu mesaja git ve **geçici olarak vurgula**.
   * Ortam içi aramadan gelir. Atlama/vurgulama makinesi zaten `useMessageListController`'daydı
   * (kanal içi arama kullanıyordu); eksik olan tek şey DIŞARIDAN tetiklenmesiydi.
   */
  jumpToMessageId?: string;
  /**
   * 🔴 Mesaj arama gösterilsin mi (sahip kararı 2026-08-01). Varsayılan AÇIK, **1-1 DM'de kapalı**:
   * arama ortam kanallarında değerli, 1-1'de karşında tek kişi var. Web'de de aynısı yapıldı.
   */
  searchable?: boolean;
}

// Sprint M1a — kanal VE DM mesaj ekranı için TEK gövde (contract §5 ekran 3: "aynısı"). İkisi de
// aynı REST/WS yüzeyini kullanır (`/channels/:id/messages` — DM kanalı da bir Channel satırıdır);
// yalnız "okundu" ucu ve başlık farklı, onlar çağıran route'tan gelir.
export function MessageScreen({
  channelId,
  placeholder,
  markRead,
  typingMode,
  disabledNotice,
  headerActions,
  searchable = true,
  jumpToMessageId,
}: Props) {
  const authUser = useAuthStore((s) => s.user);
  const fetchInitial = useMessagesStore((s) => s.fetchInitial);
  const seedKnownUser = useMessagesStore((s) => s.seedKnownUser);
  const resolveUsername = useMessagesStore((s) => s.resolveUsername);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);

  // "Yazıyor" yayını + etiketi kendi kancasında (M1d-C §2.1).
  const typing = useTypingEmitter(channelId, typingMode);
  // Giriş kutusu: metin, gönderim, yanıt/düzenleme modları (M1d-C §2.5).
  const composer = useMessageComposer(channelId, typing);

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
    setActiveChannel(channelId, fetchMessages);
    joinChannel(channelId).then((ack) => {
      if (__DEV__ && !ack.ok) console.warn('[MessageScreen] join başarısız:', ack.error);
    });

    return () => {
      cancelled = true;
      setActiveChannel(null);
      leaveChannel(channelId);
      // typing:stop artık `useTypingEmitter`in kendi temizliğinde (aynı channelId'ye bağlı).
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    if (authUser) seedKnownUser(channelId, authUser.id, authUser.username);
  }, [authUser, channelId, seedKnownUser]);

  // Liste verisi + kaydırma davranışı (gruplama · dibe yapışma · yeni mesaj sayacı · zıplama).
  const list = useMessageListController(channelId, authUser?.id, jumpToMessageId);
  const { items, inverted } = list;
  // Mesaj paneli akışı (uzun basış · tepki · kopyala · sil) — M1d-C §2.4.
  const actions = useMessageActions(channelId);


  // 🔴 Klavye + gezinme çubuğu payı — bu blok İKİ KEZ yanlış kuruldu, ikisi de kayda geçiyor.
  //
  // Deneme 1 (KAV yok, `max(klavye yüksekliği, insets.bottom)`): klavye yüksekliğini ham okuyup
  // kapsayıcıya pay verdi. **Sahibin cihazında kutu tepeye fırladı** (2026-08-01): o cihazda
  // pencere klavye açılınca ZATEN küçülüyor, yani pay ikinci kez eklenmiş oldu. Üç tuşlu cihazda
  // ise tersi çıktı, eksik kaldı. Varsayım yanlıştı: "pencere küçülmez" her cihazda doğru değil.
  //
  // Doğru olan ÖLÇMEK: `KeyboardAvoidingView` yüksekliği varsaymaz, görünümün gerçek çerçevesi ile
  // klavyenin ekran koordinatı farkını ölçer; cihazın davranışını cihazdan öğrenir. Gezinme çubuğu
  // payı AYRI iştir, yalnız klavye KAPALIYKEN verilir (açıkken KAV zaten itiyor).
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const bottomInset = keyboardVisible ? 0 : insets.bottom;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActionsRow}>
              {headerActions}
              {searchable && (
                <Pressable
                  onPress={() => setSearchVisible(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.search')}
                >
                  <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              )}
            </View>
          ),
        }}
      />

      {loadState === 'loading' && <MessageLoading />}
      {loadState === 'error' && <MessageError message={errorMessage} onRetry={retryLoad} />}
      {loadState === 'ready' && items.length === 0 && <MessageEmpty />}

      {loadState === 'ready' && items.length > 0 && (
        <FlatList
          ref={list.listRef}
          data={inverted}
          keyExtractor={(item) => item.message.id}
          inverted
          contentContainerStyle={styles.list}
          onScroll={list.onListScroll}
          scrollEventThrottle={16}
          onEndReachedThreshold={0.4}
          onEndReached={() => list.onEndReached(loadState === 'ready')}
          onScrollToIndexFailed={(info) => {
            // Değişken yükseklikli mesaj satırlarında scrollToIndex ilk denemede başarısız olabilir
            // (RN bilinen sınırı) — kısa gecikmeyle tekrar dene.
            setTimeout(() => {
              list.listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.4 });
            }, 60);
          }}
          ListFooterComponent={
            list.loadingOlder ? <ActivityIndicator color={theme.colors.textMuted} style={styles.loadMore} /> : null
          }
          renderItem={({ item }) => (
            <MessageBubble
              message={item.message}
              showAuthor={item.showAuthor}
              isMine={item.message.author.id === authUser?.id}
              resolveMention={(id) => resolveUsername(channelId, id)}
              highlighted={item.message.id === list.highlightId}
              onLongPress={() => actions.open(item.message)}
              onToggleReaction={(emoji) => actions.toggleReaction(item.message, emoji)}
            />
          )}
        />
      )}

      {/* "Aşağı in" düğmesi — yalnız yukarıda geçmiş okurken yeni mesaj geldiyse görünür (web
          MessageArea.vue REV-9 karşılığı). Boş yüzey değil: sayaç sıfırken hiç render edilmez. */}
      {list.newMessageCount > 0 && (
        <Pressable onPress={list.jumpToBottom} style={styles.newMessagePill}>
          <Text style={styles.newMessagePillCount}>
            {list.newMessageCount > 99 ? '99+' : list.newMessageCount}
          </Text>
          <Text style={styles.newMessagePillText}>{t('message.newMessages')}</Text>
          <Ionicons name="arrow-down" size={14} color={theme.colors.textPrimary} />
        </Pressable>
      )}

      <MessageComposer
        value={composer.input}
        onChangeText={composer.onChangeInput}
        onSend={composer.onSend}
        sending={composer.sending}
        sendError={composer.sendError}
        placeholder={placeholder}
        disabledNotice={disabledNotice}
        typingLabel={typing.label}
        bottomInset={bottomInset}
        replyToAuthor={composer.replyTo?.author.username}
        replyToSnippet={composer.replyTo?.content}
        editing={!!composer.editing}
        onCancelMode={composer.cancelMode}
      />

      <MessageActionHost
        actions={actions}
        onReply={() => {
          const m = actions.target;
          actions.close();
          if (m) composer.startReply(m);
        }}
        onEdit={() => {
          const m = actions.target;
          actions.close();
          if (m) composer.startEdit(m);
        }}
      />

      {searchVisible && (
        <MessageSearchModal
          channelId={channelId}
          onClose={() => setSearchVisible(false)}
          onJump={(id) => {
            setSearchVisible(false);
            list.requestJump(id);
          }}
        />
      )}
    </KeyboardAvoidingView>
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
});
