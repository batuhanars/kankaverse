import type { Href } from 'expo-router';
import { useDmStore } from '@/stores/dm';
import { dmRouteParams } from './dmRoute';

/**
 * Sprint M3 §3 — push bildirimine dokununca gidilecek ekranı çözer.
 *
 * Girdi `(tabs)/notifications.tsx`'teki `onItemPress`'in aldığı `NotificationDto` DEĞİL: sunucu
 * push'a yalnız `{ type, guildId, channelId, messageId }` gömüyor (api `notifications.service.ts`
 * `toPushPayload` + `messages.gateway.ts` `sendDmPush` — `actor`/`preview` push data'sında yok).
 * Bu yüzden `onItemPress`'in switch'i birebir kopyalanmadı (şekiller uyuşmuyor); hedef eşlemesi
 * aynı (MENTION/EVENT_CREATED/FRIEND_*), DM hedefi ise mevcut `dmRoute.ts`/`dm` store'u KULLANIR
 * (kopya değil) — kanal store'da yüklüyse başlık/avatar/izin bayrakları da gelir, yoksa
 * `dm/[id].tsx`'in zaten tolere ettiği minimal id ile açılır (bkz. o dosyadaki `storeChannel` yorumu).
 */
export function resolvePushTarget(data: Record<string, unknown>): Href | null {
  const type = typeof data.type === 'string' ? data.type : null;
  const guildId = normalizeId(data.guildId);
  const channelId = normalizeId(data.channelId);

  switch (type) {
    case 'MENTION':
      if (!channelId) return null;
      // `onItemPress` ile aynı hedef: guild kanalıysa kanal ekranı, yoksa DM.
      // 🔴 Kusur düzeltmesi (sahip bulgusu 2026-08-03, cihaz turu) — `guildId` BİLİNÇLİ olarak
      // geçilmiyordu ("bildirimler sekmesindeki mevcut tuhaflığı aynala" kararı, bkz. eski yorum).
      // Sonuç: kanal ekranı `guildId` olmadan açılıyor → `rolesApi.listByGuild` hiç çekilmiyor →
      // `resolveRole` her zaman `undefined` → mesaj gövdesinde `@everyone`/rol etiketleri "@rol"
      // yedeğine düşüyor. Sunucu `data.guildId`yi zaten gönderiyor (bkz. dosya başı yorumu);
      // taşımamak bilinçli bir kısıtlama değil, kopyalanan bir eksiklikti. Artık taşınıyor.
      return guildId
        ? { pathname: '/channel/[id]', params: { id: channelId, name: '', guildId } }
        : dmTarget(channelId);
    case 'DM_MESSAGE':
      // M3 §2.6 — DM push'u kalıcı bildirim ÜRETMEZ, yalnız push gider; hedef her zaman DM ekranı.
      if (!channelId) return null;
      return dmTarget(channelId);
    case 'EVENT_CREATED':
      if (!guildId) return null;
      return { pathname: '/guild-events', params: { guildId } };
    case 'FRIEND_REQUEST':
      return '/friends-add';
    case 'FRIEND_ACCEPT':
      return '/friends-list';
    default:
      // GUILD_INVITE dahil: push data'sında davet kodu yok (`preview` taşınmıyor), hedef
      // kurulamaz — kırık navigasyon vaat etmek yerine yalnız uygulama açılır (§3 kuralı).
      return null;
  }
}

/** M4a-2 (`notifications/incomingCall.ts`) de aynı hedefi kullanır: bildirim gövdesine dokununca
 *  o DM'e gidiliyor — push'un DM hedefiyle aynı çözümleme, kopya yok. */
export function dmTarget(channelId: string): Href {
  const channel = useDmStore.getState().channels.find((c) => c.id === channelId);
  if (channel) return dmRouteParams(channel);
  return { pathname: '/dm/[id]', params: { id: channelId } };
}

/** Android/FCM data payload'ı bazen `null`'ı string'e çevirir (`"null"`) — savunmacı normalize. */
function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value === 'null' || value === 'undefined') return null;
  return value;
}
