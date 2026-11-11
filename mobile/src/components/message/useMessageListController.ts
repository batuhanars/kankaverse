import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useMessagesStore } from '@/stores/messages';
import { isNewDay } from '@/utils/dateSeparator';
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
  /** C11 — bu mesajın ÜSTÜNE tarih ayracı girer mi? (yeni gün burada başlıyor) */
  isDayStart: boolean;
}

/** Web `MessageArea.vue` onListScroll ile aynı eşik. Liste `inverted`, yani dip = offset 0. */
const STICK_THRESHOLD = 120;

/** Aramadan zıplarken kaç sayfa geriye gidilir — sınırsız değil (silinmiş/çok eski mesajda döngü olmaz). */
const MAX_JUMP_FETCH_ATTEMPTS = 20;

const HIGHLIGHT_MS = 2500;

/** "En alta in" düğmesi dipten bu kadar uzaklaşınca görünür (web ile aynı eşik); küçük kaydırmada çıkmaz. */
const SCROLL_DOWN_THRESHOLD = 300;

/**
 * Ardışık mesajları grupla: aynı yazarın 5 dakika içindeki mesajlarında başlık (avatar + ad + saat)
 * tekrar edilmez. Liste verisinin kendisi olduğu için bu dosyada — ekran yalnız render eder.
 *
 * C11 — tarih ayracı burada TÜRETİLİR (mesaja yazılmaz): her hesaplamada komşu karşılaştırması
 * yapılır, böylece yukarı kaydırıp eski paket başa eklendiğinde eski en-üst ayraç kendiliğinden
 * doğru yere kayar. Ayrıca ayraç grubu BÖLER (§3): ayraçtan sonraki ilk mesaj aynı yazara ait
 * olsa bile tam başlıkla çizilir, yoksa ayracın altında sahipsiz bir gövde kalırdı.
 * Burada yalnız "yeni gün mü" kararı var; ETİKET ("Bugün"/"Dün") render anında hesaplanır.
 */
function buildRenderItems(messages: MessageDto[]): RenderItem[] {
  const FIVE_MIN = 5 * 60 * 1000;
  return messages.map((message, idx) => {
    const prev = messages[idx - 1];
    const isDayStart = isNewDay(message.createdAt, prev?.createdAt);
    const showAuthor =
      isDayStart ||
      !prev ||
      prev.author.id !== message.author.id ||
      // C35: ayni webhook mesaj basina farkli `username` gonderebilir; farkli ad = yeni oyun/grup
      (!!message.webhook && prev.author.username !== message.author.username) ||
      new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > FIVE_MIN;
    return { message, showAuthor, isDayStart };
  });
}

/**
 * @param initialJumpId Sprint M1g R1 — ekran açılır açılmaz gidilecek mesaj (ortam içi aramadan).
 *   Atlama/vurgulama zaten burada vardı (kanal içi arama kullanıyordu); eksik olan tek şey
 *   DIŞARIDAN tetiklenmesiydi. Yalnız BİR KEZ çalışır — her render'da tetiklense vurgu hiç sönmez
 *   ve liste sürekli kendini kaydırırdı.
 */
export function useMessageListController(
  channelId: string,
  myUserId: string | undefined,
  initialJumpId?: string,
) {
  const channelState = useMessagesStore((s) => s.byChannel[channelId]);
  const fetchOlder = useMessagesStore((s) => s.fetchOlder);

  // Liste eskiden yeniye saklanır; FlatList `inverted` olduğu için render sırası terstir.
  const items = useMemo(() => buildRenderItems(channelState?.messages ?? []), [channelState?.messages]);
  const inverted = useMemo(() => [...items].reverse(), [items]);

  const listRef = useRef<FlatList<RenderItem>>(null);
  const atBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const [newMessageCount, setNewMessageCount] = useState(0);
  // Kaydırma olayı saniyede onlarca kez gelir; durum yalnız eşik geçilince değişsin diye ref ile kıyaslanır.
  const [scrolledUp, setScrolledUp] = useState(false);
  const scrolledUpRef = useRef(false);
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
    scrolledUpRef.current = false;
    setScrolledUp(false);
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

  const jumpedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialJumpId || jumpedRef.current === initialJumpId) return;
    jumpedRef.current = initialJumpId;
    jumpAttemptsRef.current = 0;
    setHighlightId(initialJumpId);
  }, [initialJumpId]);

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
    // D99: ilk sayfa henüz gelmediyse (soguk acilis, sifreli DM hidrasyonu) bekle; hedefi dusurme.
    if (!channelState) return;
    if (channelState.hasMore && jumpAttemptsRef.current < MAX_JUMP_FETCH_ATTEMPTS) {
      jumpAttemptsRef.current += 1;
      setLoadingOlder(true);
      fetchOlder(channelId).finally(() => setLoadingOlder(false));
    } else {
      // Ulaşılamadı (temizlenmiş/çok eski) — kullanıcı zaten bu kanalda kalır.
      setHighlightId(null);
    }
  }, [highlightId, inverted, channelState, loadingOlder, channelId, fetchOlder]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  function onListScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    atBottomRef.current = y < STICK_THRESHOLD;
    if (atBottomRef.current && newMessageCount > 0) setNewMessageCount(0);
    const up = y > SCROLL_DOWN_THRESHOLD;
    if (up !== scrolledUpRef.current) {
      scrolledUpRef.current = up;
      setScrolledUp(up);
    }
  }

  function onEndReached(ready: boolean) {
    if (!ready || loadingOlder || !channelState?.hasMore) return;
    setLoadingOlder(true);
    fetchOlder(channelId).finally(() => setLoadingOlder(false));
  }

  return {
    items,
    inverted,
    listRef,
    newMessageCount,
    scrolledUp,
    jumpToBottom,
    loadingOlder,
    highlightId,
    requestJump,
    onListScroll,
    onEndReached,
  };
}
