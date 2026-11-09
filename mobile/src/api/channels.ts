import http from './http';

// Sprint M1a contract §3 + api/src/modules/channels/channels.controller.ts — alan adları
// backend'in ChannelDto şeklinden birebir okundu. Yalnız sidebar'ın kullandığı alt küme tiplendi
// (Rule of Three — mobile/CLAUDE.md M0 emsali: kullanılmayan alanı tiplemek erken soyutlama).
export const ChannelType = {
  GUILD_TEXT: 'GUILD_TEXT',
  GUILD_VOICE: 'GUILD_VOICE',
  DM: 'DM',
  GROUP_DM: 'GROUP_DM',
} as const;
// TS "enum-like const object" deseni — değer ve tip aynı adı taşır (Handbook önerisi); ESLint
// @typescript-eslint/no-redeclare bunu declaration-merging'den ayırt edemiyor, bilinçli olarak susturuldu.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export interface ChannelSummaryDto {
  id: string;
  type: ChannelType;
  guildId: string | null;
  name: string | null;
  position: number;
  unreadCount: number;
  unreadMentionCount: number;
  categoryId: string | null;
  // M1d-B: sunucu `toChannelDto`'da zaten dönüyordu (channels.service.ts), yalnız tiplenmemişti.
  // Kanal düzenleme ekranına mevcut değeri taşımak için gerekli — yeni backend alanı DEĞİL.
  ageGated: boolean;
  // M1e: aynı durum — `toChannelDto` bunları da dönüyor, düzenleme ekranı genişleyince tiplendi.
  isPrivate: boolean;
  slowModeSeconds: number;
  // Sprint M4c §8 — item 6 pariteti (web `types/index.ts` `locked`): özel kanal HERKESE görünür,
  // `locked=true` ise kullanıcı görür ama GİREMEZ (üye değil). `toChannelDto` bunu her zaman
  // döner (varsayılan false) — mobil M4c'ye kadar bu alanı hiç tiplemiyordu çünkü kilit hiçbir
  // yüzeyde GÖSTERİLMİYORDU; ses kanalı satırı bunu artık gösteriyor (§2/§8).
  locked: boolean;
  // Sprint M4g — `toChannelDto` üçünü zaten dönüyordu (channels.service.ts), yalnız tiplenmemişti.
  // Yalnız GUILD_VOICE'ta anlamlı; `channel-edit` bu alanları yalnız `type === GUILD_VOICE` iken
  // gösterir/gönderir (fail-closed — §3 sözleşme).
  userLimit: number;
  bitrate: number;
  mediaEnabled: boolean;
  // C57 — salt okunur metin kanalı; yalnız MANAGE_CHANNELS yazar (sunucu otorite).
  readOnly: boolean;
}

export const channelsApi = {
  async listByGuild(guildId: string): Promise<ChannelSummaryDto[]> {
    const res = await http.get<ChannelSummaryDto[]>(`/guilds/${guildId}/channels`);
    return res.data;
  },
  async markRead(channelId: string): Promise<null> {
    const res = await http.post<null>(`/channels/${channelId}/read`);
    return res.data;
  },

  /**
   * Sprint M1d-B (sözleşme §11) — kanal oluştur (OWNER/ADMIN).
   *
   * Sprint M4c §7 — `type` artık gönderiliyor (`channel-new.tsx`'teki tür seçici). M1d-B'den beri
   * gönderilmiyordu çünkü mobil ses kanallarını hiç listelemiyordu (girilemeyen satır = boş yüzey);
   * M4c bu kısıtı kaldırdı (§2 — kanal listesi artık `GUILD_VOICE`i de gösteriyor).
   *
   * Sorulmayan alanlar (varsayılanla gider): `slowModeSeconds` · `userLimit` · `bitrate` ·
   * `mediaEnabled` — sahip kararı (M4g sözleşmesi): bu alanlar OLUŞTURMA formuna KONMAZ, yalnız
   * var olan kanalın ayarlarında (`channel-edit`) düzenlenir. Kapsam dışı kalan OLUŞTURMA, DÜZENLEME
   * değil (M4g'den önce ikisi de yoktu).
   * Sorulanlar erişim kararıdır: `isPrivate` + `ageGated` (T&S kapısı).
   */
  async create(
    guildId: string,
    body: {
      name: string;
      type?: ChannelType;
      categoryId?: string | null;
      isPrivate?: boolean;
      ageGated?: boolean;
    },
  ): Promise<ChannelSummaryDto> {
    const res = await http.post<ChannelSummaryDto>(`/guilds/${guildId}/channels`, body);
    return res.data;
  },

  /**
   * M1e — düzenleme yüzeyi genişledi (sahip talebi 2026-08-01): kategori · özel kanal · yavaş mod.
   *
   * M4g — `userLimit` · `bitrate` · `mediaEnabled` eklendi. 🔴 Bunlar **yalnız ses kanalı**
   * alanları; `channel-edit` bunları yalnız `type === GUILD_VOICE` iken body'ye ekler (fail-closed,
   * §3 sözleşme) — çağıran `type` taşımazsa bu üçü hiç gönderilmez, yanlış kanala yazılmaz.
   * 🔴 Kanal "başlığı"/açıklaması (Discord'daki topic) **sunucuda YOK** — `Channel` modelinde böyle
   * bir alan yok, o yüzden ekranda da yok.
   */
  async update(
    channelId: string,
    body: {
      name?: string;
      ageGated?: boolean;
      isPrivate?: boolean;
      slowModeSeconds?: number;
      categoryId?: string | null;
      userLimit?: number;
      bitrate?: number;
      mediaEnabled?: boolean;
      readOnly?: boolean;
    },
  ): Promise<ChannelSummaryDto> {
    const res = await http.patch<ChannelSummaryDto>(`/channels/${channelId}`, body);
    return res.data;
  },

  /** Son kanal silinemez → sunucu `409 LAST_CHANNEL` döner; mesajı olduğu gibi gösterilir. */
  async remove(channelId: string): Promise<null> {
    const res = await http.delete<null>(`/channels/${channelId}`);
    return res.data;
  },
};
