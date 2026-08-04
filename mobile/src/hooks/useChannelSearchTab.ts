import { useCallback, useEffect, useState } from 'react';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorCode, extractErrorMessage } from '@/api/errors';

const ACCESS_DENIED_CODE = 'NOT_CHANNEL_MEMBER';

/**
 * Sprint M2c contract §4.3 — kanal detay ekranının Medya/Bağlantılar/Dosyalar sekmelerinin ÜÇÜ de
 * aynı uca gidiyor, yalnız `has` değeri farklı. Üçüncü kullanımda (Rule of Three) tek kancaya
 * çıkarılmıştı.
 *
 * Sprint M3b §5.1 — uç **ortam kapsamlıdan kanal kapsamlıya** taşındı:
 * `GET /guilds/:id/messages/search?in=<channelId>&has=<X>` → `GET /channels/:id/messages/search?has=<X>`.
 * Sebep: DM'in `guildId`'si yok, o yüzden DM detay ekranının aynı sekmeleri eski uçtan beslenemezdi.
 * `guildId` parametresi bu yüzden kancadan ve üç sekme bileşeninden DÜŞTÜ — ortam kanalı ve DM tek
 * yoldan akıyor, çağıranda dallanma kalmadı.
 *
 * Sonuç artık düz `MessageDto[]` (kanal ucu gruplama yapmıyor); eskiden gelen tek-elemanlı grup
 * listesi de zaten burada düzleştiriliyordu — çağıranlar için şekil değişmedi.
 *
 * 🔴 Erişim kapısı SUNUCUDA (`requireChannelAccess`: yaş kapısı + özel kanal üyeliği + DM
 * `ChannelMember`) — bu kanca yalnız sonucu gösterir, süzmez.
 *
 * 🔴 **`NOT_CHANNEL_MEMBER` (403) hata DEĞİL, boş sonuçtur.** Uç değişiminin yan etkisi (PM notu,
 * 2026-08-04): ortam ucu erişilemeyen kanalda sessizce `[]` dönüyordu, kanal ucu 403 FIRLATIYOR.
 * "Görünür ama girişi kapalı" özel kanalın detayını açan üye-olmayan kullanıcıya kırmızı hata
 * basmak gürültü olurdu — zaten giremediğini biliyor. Bu yüzden bu tek kod boş listeye çevriliyor;
 * diğer kodlar normal hata durumunda kalır (bağlantı koptuysa kullanıcı bunu bilmeli).
 * Karar TEK YERDE, üç sekmeye kopyalanmadı — kopyalansa biri unutulur ve sekmeler ayrışırdı.
 */
export function useChannelSearchTab(channelId: string, has: 'image' | 'link' | 'file') {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setState('loading');
    setErrorMessage('');
    messagesApi
      .search(channelId, { has })
      .then((list) => {
        setMessages(list);
        setState('ready');
      })
      .catch((e) => {
        if (extractErrorCode(e) === ACCESS_DENIED_CODE) {
          setMessages([]);
          setState('ready');
          return;
        }
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, [channelId, has]);

  useEffect(() => {
    load();
  }, [load]);

  return { state, messages, errorMessage, retry: load };
}
