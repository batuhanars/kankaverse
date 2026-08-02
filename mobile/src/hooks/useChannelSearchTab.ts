import { useCallback, useEffect, useState } from 'react';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';

/**
 * Sprint M2c contract §4.3 — kanal detay ekranının Medya/Bağlantılar/Dosyalar sekmelerinin ÜÇÜ de
 * aynı uca (`GET /guilds/:id/messages/search?in=<channelId>&has=<X>`) gidiyor, yalnız `has`
 * değeri farklı. Üçüncü kullanımda (Rule of Three) tek kancaya çıkarıldı.
 *
 * `in=channelId` verildiği için sunucu tek kanala gruplu sonuç döner (en fazla bir `group`); istemci
 * bunu tek düz mesaj listesine indirger — çağıranın kanal adını ayrıca göstermesi gerekmiyor,
 * zaten kanal detay ekranının kendi bağlamındayız.
 *
 * 🔴 Erişim kapısı SUNUCUDA (contract §5) — bu kanca yalnız sonucu gösterir, süzmez.
 */
export function useChannelSearchTab(guildId: string, channelId: string, has: 'image' | 'link' | 'file') {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setState('loading');
    setErrorMessage('');
    messagesApi
      .searchGuild(guildId, { in: channelId, has })
      .then((groups) => {
        setMessages(groups.flatMap((g) => g.messages));
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, [guildId, channelId, has]);

  useEffect(() => {
    load();
  }, [load]);

  return { state, messages, errorMessage, retry: load };
}
