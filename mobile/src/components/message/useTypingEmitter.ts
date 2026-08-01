import { useEffect, useRef } from 'react';
import { emitTypingStart, emitTypingStop } from '@/realtime/socket';
import { useTypingStore } from '@/stores/typing';
import { t } from '@/i18n';

/**
 * "Yazıyor" göstergesinin İKİ yönü: kendi yazışımı yayınlamak + karşıdakinin etiketini üretmek.
 *
 * `MessageScreen`den ayrıldı (M1d-C §2.1, saf taşıma). İkisi tek kancada çünkü ikisi de aynı
 * `channelId`'ye ve aynı ömre bağlı; ayrı ayrı bölmek iki dosyada aynı bağımlılığı taşımak olurdu.
 *
 * Yayın kuralı (Sprint 6.1): ilk karakterde `typing:start`, kutu boşalınca `typing:stop`, arada
 * 3 saniyede bir tazeleme (sunucu tarafı 5 saniyede düşürüyor). Ekran kapanırken de `stop` gider —
 * yoksa karşı tarafta "yazıyor" takılı kalırdı.
 */
const EMPTY_TYPING_USERS: { userId: string; username: string }[] = [];
const REFRESH_MS = 3000;

export function useTypingEmitter(channelId: string, mode: 'named' | 'simple') {
  // zustand + React 19 tuzağı: selector her çağrıda YENİ `[]` dönerse sonsuz render döngüsü olur
  // ("getSnapshot should be cached"). Kanalda yazan yoksa hep AYNI boş dizi referansı döner.
  const typingUsers = useTypingStore((s) => s.byChannel[channelId] ?? EMPTY_TYPING_USERS);

  const isTypingRef = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      if (isTypingRef.current) {
        emitTypingStart(channelId);
        scheduleRefresh();
      }
    }, REFRESH_MS);
  }

  /** Giriş kutusu her değiştiğinde çağrılır; start/stop kararını metnin doluluğu verir. */
  function onInputChange(text: string) {
    if (!isTypingRef.current && text.length > 0) {
      isTypingRef.current = true;
      emitTypingStart(channelId);
      scheduleRefresh();
    } else if (isTypingRef.current && text.length === 0) {
      stop();
    }
  }

  /** Gönderimden sonra ve ekran kapanırken. */
  function stop() {
    isTypingRef.current = false;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    emitTypingStop(channelId);
  }

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (isTypingRef.current) emitTypingStop(channelId);
    },
    [channelId],
  );

  // Sprint 6 R1-c: 1-1 DM'de sade "yazıyor…", ortam kanalında isimli "X yazıyor…".
  function label(): string | null {
    if (typingUsers.length === 0) return null;
    if (mode === 'simple') return t('typing.simple');
    if (typingUsers.length === 1) return t('typing.one', { user: typingUsers[0].username });
    if (typingUsers.length === 2) {
      return t('typing.two', { user1: typingUsers[0].username, user2: typingUsers[1].username });
    }
    return t('typing.many');
  }

  return { onInputChange, stop, label: label() };
}
