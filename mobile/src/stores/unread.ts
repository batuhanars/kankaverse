import { useMemo } from 'react';
import { create } from 'zustand';
import type { GuildSummaryDto } from '@/api/guilds';
import type { ChannelSummaryDto } from '@/api/channels';
import { NotificationLevel } from '@/api/notifications';
import { useDmStore } from './dm';
import { channelBadgeEffect, resolvePref, useNotificationPrefsStore } from './notificationPrefs';

/**
 * Sprint M2a §5 — merkezi okunmamış/bahsetme deposu.
 *
 * Neden: bugüne kadar kanal sayacı `ChannelSidebar`'ın yerel `useState`'inde yaşıyordu, ortam
 * sayacı hiç yoktu, DM sayacı ayrı bir store'daydı. Rail + kanal listesi + tab bar + üç sohbet
 * ekranı geri oku aynı sayıyı göstermek zorunda — dört ayrı yerde hesaplanamaz (sözleşme §5).
 *
 * REST yanıtları (`GET /guilds`, `GET /guilds/:id/channels`) bu store'un İLK hydrate kaynağı;
 * soket olayları (`realtime/socket.ts`) sonra üzerine yazar. DM okunmamışı BURAYA taşınmadı —
 * `stores/dm.ts` zaten çalışıyor, canlı; iki store BİRLEŞTİRİLMEZ (§5 son satır).
 */
interface UnreadCounts {
  unread: number;
  mentions: number;
}

interface UnreadState {
  guilds: Record<string, UnreadCounts>;
  channels: Record<string, UnreadCounts>;

  /** `GET /guilds` yanıtından doldurur (home.tsx `fetchGuilds`). */
  hydrateGuilds: (list: GuildSummaryDto[]) => void;
  /** `GET /guilds/:id/channels` yanıtından doldurur (ChannelSidebar `fetchAll`) — yalnız o
   *  guild'in kanalları güncellenir, diğer guild'lerin daha önce hydrate edilmiş kanalları KALIR. */
  hydrateChannels: (guildId: string, list: ChannelSummaryDto[]) => void;
  /**
   * Soket olayında artırır (kanal VE ortam). `mention: true` yalnız bahsetme sayacını artırır —
   * genel okunmamış sayacı DEĞİL: bahsedilen mesaj zaten ayrıca bir `channel.activity` yayınıyla
   * gelir (bkz. `realtime/socket.ts`), ikisi birden sayılırsa backend'in tuttuğu sayıyla ayrışır
   * (backend `unreadCount` mention mesajlarını da kapsıyor — `channels.service.ts` `message.count`).
   *
   * Sprint M2b §10 R2-1 — kanalın KENDİ sayacı HER ZAMAN ham artar (backend de kanal ucunda ham
   * sayı dönüyor; süzme gösterim katmanında — `ChannelRow`). Ortam toplamına katkı ise
   * `channelBadgeEffect` (backend `resolveChannelBadgeEffect` ile birebir) tablosundan geçer —
   * aksi hâlde REST (`GET /guilds`, artık backend'de süzülüyor) ile canlı soket artışı ayrışırdı.
   */
  bumpChannel: (channelId: string, guildId: string, opts?: { mention?: boolean }) => void;
  /**
   * Okundu işaretlemede yerel temizlik — kanalın sayacı kadarını ortamdan da düşer (sıfırlamaz,
   * o guild'in BAŞKA kanallarının sayacı etkilenmesin).
   *
   * Sprint M2b §10 R2-1 sonrası zorunlu düzeltme: `bumpChannel` artık ortama HER ZAMAN 1:1
   * yansıtmıyor (`channelBadgeEffect` süzüyor). Bu yüzden temizlik de AYNI süzgeci uygulamak
   * zorunda — aksi hâlde susturulmuş/`NONE` bir kanaldan gelen ham sayı, hiç eklenmediği ortam
   * toplamından düşülür ve diğer kanalların meşru rozetini yanlışlıkla sıfırlar.
   */
  clearChannel: (channelId: string, guildId: string) => void;
  /** Oturum sonu — bir sonraki kullanıcı öncekinin rozetlerini görmesin (dm/friends store'daki
   *  aynı `reset()` deseni, (app)/_layout.tsx unmount'unda çağrılır). */
  reset: () => void;
}

const ZERO: UnreadCounts = { unread: 0, mentions: 0 };

export const useUnreadStore = create<UnreadState>((set) => ({
  guilds: {},
  channels: {},

  hydrateGuilds(list) {
    set((s) => ({
      guilds: {
        ...s.guilds,
        ...Object.fromEntries(
          list.map((g) => [g.id, { unread: g.unreadCount, mentions: g.unreadMentionCount }]),
        ),
      },
    }));
  },

  hydrateChannels(guildId, list) {
    set((s) => ({
      channels: {
        ...s.channels,
        ...Object.fromEntries(
          list.map((c) => [c.id, { unread: c.unreadCount, mentions: c.unreadMentionCount }]),
        ),
      },
    }));
  },

  bumpChannel(channelId, guildId, opts) {
    const mention = !!opts?.mention;
    // Store dışından okunur (useDmStore'un burada zaten yaptığı gibi) — `bumpChannel` bir zustand
    // action'ı, hook değil; başka bir store'a bağımlılığı `getState()` ile kurulur.
    const { countUnread, countMention } = channelBadgeEffect(
      useNotificationPrefsStore.getState().prefs,
      channelId,
    );
    set((s) => {
      const prevChannel = s.channels[channelId] ?? ZERO;
      const prevGuild = s.guilds[guildId] ?? ZERO;
      const nextChannel = mention
        ? { ...prevChannel, mentions: prevChannel.mentions + 1 }
        : { ...prevChannel, unread: prevChannel.unread + 1 };
      const nextGuild = mention
        ? countMention
          ? { ...prevGuild, mentions: prevGuild.mentions + 1 }
          : prevGuild
        : countUnread
          ? { ...prevGuild, unread: prevGuild.unread + 1 }
          : prevGuild;
      return {
        channels: { ...s.channels, [channelId]: nextChannel },
        guilds: { ...s.guilds, [guildId]: nextGuild },
      };
    });
  },

  clearChannel(channelId, guildId) {
    // bumpChannel'daki AYNI tablo — bu kanal ortama hiç katkı vermediyse (susturulmuş/`NONE`),
    // temizlikte de düşülecek bir şey yok; düşseydik başka kanalların rozetini kırardık.
    const { countUnread, countMention } = channelBadgeEffect(
      useNotificationPrefsStore.getState().prefs,
      channelId,
    );
    set((s) => {
      const prevChannel = s.channels[channelId] ?? ZERO;
      const prevGuild = s.guilds[guildId] ?? ZERO;
      return {
        channels: { ...s.channels, [channelId]: { unread: 0, mentions: 0 } },
        guilds: {
          ...s.guilds,
          [guildId]: {
            unread: countUnread ? Math.max(0, prevGuild.unread - prevChannel.unread) : prevGuild.unread,
            mentions: countMention
              ? Math.max(0, prevGuild.mentions - prevChannel.mentions)
              : prevGuild.mentions,
          },
        },
      };
    });
  },

  reset() {
    set({ guilds: {}, channels: {} });
  },
}));

/**
 * Sprint M2b §10 R2-2 — okunmamış DM/grup DM adedi, §5 süzgeciyle: hedef (`targetType: 'CHANNEL'`,
 * `targetId: <dm channelId>`) susturulmuşsa veya seviyesi `NONE`'sa sayılmaz. `resolvePref`
 * guildId'siz çağrılır — DM'in bağlı olduğu bir ortam yok, fallback yolu hiç tetiklenmez, yalnız
 * kendi kaydı veya varsayılan.
 *
 * §10 R3-1 — rail'in DM girişindeki kırmızı sayaç VE `useTotalPing` AYNI sayıyı okur, tek tanım
 * burada (önceden yalnız `useTotalPing` içinde satır içiydi, rail de ihtiyaç duyunca çıkarıldı).
 */
export function useDmUnreadCount(): number {
  const prefs = useNotificationPrefsStore((s) => s.prefs);
  const dmChannels = useDmStore((s) => s.channels);
  return useMemo(() => {
    return dmChannels.filter((c) => {
      if (!c.unread) return false;
      const resolved = resolvePref(prefs, 'CHANNEL', c.id);
      return resolved.level !== NotificationLevel.NONE && !resolved.muted;
    }).length;
  }, [dmChannels, prefs]);
}

/**
 * Sözleşme §4.3 — toplam ping: Σ tüm ortamların `unreadMentionCount` + okunmamış DM/grup DM adedi.
 * Tab bar (Ana Sayfa) VE üç sohbet ekranının geri oku (§4.4) AYNI sayıyı okur — tek tanım burada.
 * DM adedi `dm` store'undan okunur; iki store birleştirilmez (§5).
 *
 * Sprint M2b §5 R1-3 — bildirim tercihine göre süzülür: `level === 'NONE'` OLAN VEYA susturulmuş
 * (aktif mute) bir ortamın bahsetmesi toplama GİRMEZ — susturma tam sessizliktir (sahip kararı
 * 2026-08-02, ilk sürümde "susturulmuşta yine sayılır" yazıyordu, geri alındı).
 */
export function useTotalPing(): number {
  const guilds = useUnreadStore((s) => s.guilds);
  const prefs = useNotificationPrefsStore((s) => s.prefs);
  const dmUnreadCount = useDmUnreadCount();
  const guildMentions = useMemo(() => {
    let sum = 0;
    for (const [guildId, counts] of Object.entries(guilds)) {
      const resolved = resolvePref(prefs, 'GUILD', guildId);
      if (resolved.level !== NotificationLevel.NONE && !resolved.muted) sum += counts.mentions;
    }
    return sum;
  }, [guilds, prefs]);
  return guildMentions + dmUnreadCount;
}
