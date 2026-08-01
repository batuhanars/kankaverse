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
}

/** Sprint M1i — sıralama gövdesi. Üç uç da (kanal/kategori/rol) aynı şekli alıyor. */
export interface ReorderItem {
  id: string;
  position: number;
}

export const channelsApi = {
  /**
   * Sprint M1i — sürükle-bırak sıralama. `PATCH /guilds/:id/channels/reorder`, yetki OWNER/ADMIN
   * (sunucuda). `categoryId` GÖNDERİLMEZ: uç "undefined → kategori değişmez" diyor, bu ekran
   * yalnız sırayı değiştiriyor, kanalı kategoriler arasında taşımıyor.
   */
  async reorder(guildId: string, items: ReorderItem[]): Promise<null> {
    const res = await http.patch<null>(`/guilds/${guildId}/channels/reorder`, { items });
    return res.data;
  },
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
   * 🔴 `type` GÖNDERİLMİYOR (varsayılan `GUILD_TEXT`). Uç `GUILD_VOICE`i destekliyor ama mobil ses
   * kanallarını listelemiyor (M1a `GUILD_TEXT` süzgeci: girilemeyen satır = boş yüzey) → ses kanalı
   * oluşturulabilseydi kullanıcı **kendi yarattığı kanalı göremezdi**. M4 ses fazına ertelendi.
   *
   * Sorulmayan alanlar (varsayılanla gider): `slowModeSeconds` · `userLimit` · `bitrate` ·
   * `mediaEnabled`. Sorulanlar erişim kararıdır: `isPrivate` + `ageGated` (T&S kapısı).
   */
  async create(
    guildId: string,
    body: { name: string; categoryId?: string | null; isPrivate?: boolean; ageGated?: boolean },
  ): Promise<ChannelSummaryDto> {
    const res = await http.post<ChannelSummaryDto>(`/guilds/${guildId}/channels`, body);
    return res.data;
  },

  /**
   * M1e — düzenleme yüzeyi genişledi (sahip talebi 2026-08-01): kategori · özel kanal · yavaş mod.
   *
   * 🔴 Sunucunun `UpdateChannelDto`sunda AYRICA `userLimit` · `bitrate` · `mediaEnabled` var; bunlar
   * **yalnız ses kanalı** alanları ve mobil ses kanallarını hiç listelemiyor → gönderilmiyor.
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

/**
 * Kanal adı normalizasyonu — sözleşme §11 "Tuzak 1".
 *
 * Sunucu deseni: `@Matches(/^[a-z0-9çğıöşü-]+$/)` + 2-50 karakter. "Genel Sohbet" yazan kullanıcı
 * ret alır. Kullanıcıya reddedilecek bir şey yazdırıp sonra hata göstermek kötü tasarım → girdi
 * YAZARKEN normalize edilir (Discord da böyle yapıyor).
 *
 * Türkçe küçültme `toLocaleLowerCase('tr')` ile: aksi hâlde "I" → "i" olur, oysa Türkçe'de "ı"dır
 * ve "İ" → "i̇" (birleşik) çıkardı. Desende "i" ve "ı" ikisi de geçerli, ama doğru harfe düşmeli.
 *
 * NOT: web'de bu normalize YOK (kullanıcının yazdığı olduğu gibi gidiyor, sunucu reddediyor) —
 * bugünkü davet-kodu-büyük-harf vakasıyla aynı sınıf. Web'e geri taşıma ayrı karardır.
 */
export function normalizeChannelName(input: string): string {
  return input
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9çğıöşü-]/g, '')
    .slice(0, 50);
}
