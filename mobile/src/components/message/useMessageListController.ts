import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useMessagesStore } from '@/stores/messages';
import type { MessageDto } from '@/api/messages';

/**
 * Mesaj listesinin kaydırma davranışı: dibe yapışma · "yeni mesaj" sayacı · aramadan gelen mesaja
 * zıplama. `MessageScreen`den ayrıldı (M1d-C §2.1, saf taşıma — davranış değişmedi).
 *
 * Üçü tek kancada çünkü üçü de AYNI `listRef` üzerinden iş görüyor: sayaç dibe kaydırır, zıplama
 * indekse kaydırır, kaydırma olayı ikisini birden etkiler. Ayrı kancalara bölünse ref dışarıdan
 * dolaştırılırdı ve "kim kaydırdı" sorusu takip edilemez hâle gelirdi.
 */
export interface RenderItem {
  message: MessageDto;
  showAuthor: boolean;
}

/** Web `MessageArea.vue` onListScroll ile aynı eşik. Liste `inverted`, yani dip = offset 0. */
const STICK_THRESHOLD = 120;

/** Aramadan zıplarken kaç sayfa geriye gidilir — sınırsız değil (silinmiş/çok eski mesajda döngü olmaz). */
const MAX_JUMP_FETCH_ATTEMPTS = 20;

const HIGHLIGHT_MS = 2500;

export function useMessageListController(
  channelId: string,
  items: RenderItem[],
  inverted: RenderItem[],
  myUserId: string | undefined,
) {
  const channelState = useMessagesStore((s) => s.byChannel[channelId]);
  const fetchOlder = useMessagesStore((s) => s.fetchOlder);

  const listRef = useRef<FlatList<RenderItem>>(null);
  const atBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const jumpAttemptsRef = useRef(0);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const jumpToBottom = useCallback(() => {
    atBottomRef.current = true;
    setNewMessageCount(0);
    scrollToBottom();
  }, [scrollToBottom]);

  // Kanal değişince sayaç/yapışma sıfırlanır — önceki kanalın sayacı yeni kanala taşınmasın.
  useEffect(() => {
    atBottomRef.current = true;
    prevCountRef.current = 0;
    setNewMessageCount(0);
  }, [channelId]);

  // Web REV-1/REV-9 semantiği: dipteysem yeni mesajda otomatik kay; yukarıda geçmiş okuyorsam
  // kaydırma, geleni say. Kendi mesajım her koşulda dibe kaydırır ve SAYILMAZ.
  useEffect(() => {
    const count = items.length;
    const prev = prevCountRef.current;
    prevCountRef.current = count;
    // Geçmiş yükleme (prepend) sayıyı artırır ama BAŞTAN ekler; dipteki konum değişmediği için
    // kaydırma/sayma yapılmaz. Yeni mesaj her zaman SON eleman olur; ilk yüklemede prev=0.
    if (count <= prev || prev === 0) return;
    const last = items[count - 1].message;
    const mine = last.author.id === myUserId;
    if (loadingOlder) return;
    if (atBottomRef.current || mine) {
      setNewMessageCount(0);
      scrollToBottom();
    } else {
      setNewMessageCount((n) => n + (count - prev));
    }
  }, [items, myUserId, loadingOlder, scrollToBottom]);

  function requestJump(messageId: string) {
    jumpAttemptsRef.current = 0;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightId(messageId);
  }

  // Hedef yüklü sayfada bulununca kaydır + geçici vurgu; bulunmuyorsa bir sayfa daha eskiye çek —
  // bu effect bağımlılıkları üzerinden tekrar çalışır, zincirleme "aranıyor" hâli budur.
  useEffect(() => {
    if (!highlightId) return;
    const idx = inverted.findIndex((it) => it.message.id === highlightId);
    if (idx !== -1) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.4 });
      });
      highlightTimerRef.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
      return;
    }
    if (loadingOlder) return;
    if (channelState?.hasMore && jumpAttemptsRef.current < MAX_JUMP_FETCH_ATTEMPTS) {
      jumpAttemptsRef.current += 1;
      setLoadingOlder(true);
      fetchOlder(channelId).finally(() => setLoadingOlder(false));
    } else {
      // Ulaşılamadı (temizlenmiş/çok eski) — kullanıcı zaten bu kanalda kalır.
      setHighlightId(null);
    }
  }, [highlightId, inverted, channelState?.hasMore, loadingOlder, channelId, fetchOlder]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  function onListScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    atBottomRef.current = e.nativeEvent.contentOffset.y < STICK_THRESHOLD;
    if (atBottomRef.current && newMessageCount > 0) setNewMessageCount(0);
  }

  function onEndReached(ready: boolean) {
    if (!ready || loadingOlder || !channelState?.hasMore) return;
    setLoadingOlder(true);
    fetchOlder(channelId).finally(() => setLoadingOlder(false));
  }

  return {
    listRef,
    newMessageCount,
    jumpToBottom,
    loadingOlder,
    highlightId,
    requestJump,
    onListScroll,
    onEndReached,
  };
}
