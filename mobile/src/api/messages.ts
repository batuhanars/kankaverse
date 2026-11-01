import http from './http';

// Sprint M1a contract §3 + §5.5 + api/src/modules/messages/messages.service.ts `toMessageDto` —
// alan adları backend çıktısından birebir okundu. Düzenleme/silme/reaksiyon/pin alanları WS'ten
// gelen `message.updated` gövdesini karşılamak için tiplendi (contract §4.2 — gelirse işlenir),
// ama bu sprint'te mobil bunları TETİKLEMEZ (kapsam dışı, yalnız yansıtılır).
export const ScanStatus = {
  PENDING: 'PENDING',
  CLEAN: 'CLEAN',
  FLAGGED: 'FLAGGED',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- enum-like const+type deseni, bkz. api/channels.ts
export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];

export interface AttachmentDto {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  scanStatus: ScanStatus;
  /** M6b — yalnız ses ekinde dolu (ms); diğerlerinde null. */
  durationMs?: number | null;
  /** M6b §7 — 64 örnek (0-255), base64; yalnız ses ekinde, eski mesajlarda null. */
  waveform?: string | null;
  /** M6c — yalnız video ekinde: küçük resim (base64 JPEG) ve boyutlar; diğerlerinde null. */
  thumbnail?: string | null;
  width?: number | null;
  height?: number | null;
  /** C14d — yapay zeka ile üretilmiş video (sunucu kaynaklı); rozet gösterilir. */
  aiGenerated?: boolean;
}

export interface ReplyPreviewDto {
  id: string;
  content: string;
  authorUsername: string;
}

export interface MessageAuthorDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  /** C21 — ortam kanalında yazarın rol emojisi; DM'de null. */
  roleEmoji?: string | null;
}

/**
 * Sunucu tepkileri emoji bazında TOPLAYARAK döner (`messages.service.ts` `ReactionAggDto`): mesaj
 * listesinde yalnız sayı ve "ben verdim mi" gelir. "Kimler tepki verdi" ayrı uçtan çekilir
 * (`messagesApi.listReactions`, C46 §3). Kişi başı mesaj başına TEK tepki vardır (C46 §0.1).
 */
export interface ReactionDto {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

/** C46 §3 — bir tepkiyi veren kişi (mevcut kullanıcı özet şekli). */
export interface ReactionUserDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  displayName?: string | null;
}

/** C46 §3 — `GET .../reactions` grubu. `users` en fazla 200 satırla sınırlı; `count` gerçek toplam. */
export interface ReactionGroupDto {
  emoji: string;
  count: number;
  users: ReactionUserDto[];
}

/**
 * Sprint M1g — ortam geneli arama filtreleri. Ad ve değerler `GuildSearchController` sorgu
 * parametreleriyle **BİREBİR** (`from` = authorId, `mentions` = userId, `in` = channelId).
 *
 * Sprint M2c contract §2 — `has` üçüncü değer aldı: `image` (eki `image/*` veya `video/*` olan
 * mesajlar — kanal detay "Medya" sekmesi). `file` sunucuda AYNI PR'de daraltıldı (artık yalnız
 * medya-DIŞI ekli mesajlar); istemci tarafında bu yalnız bir tip genişlemesi, davranış sunucuda.
 */
export interface GuildSearchParams {
  q?: string;
  from?: string;
  mentions?: string;
  in?: string;
  has?: 'link' | 'image' | 'file';
}

/**
 * Sprint M3b §5.1 — **kanal kapsamlı** arama parametreleri (`GET /channels/:id/messages/search`).
 * `has` değerleri ortam ucuyla AYNI (yeni değer icat edilmedi); `has` doluyken `q` opsiyonel,
 * `has` yokken bugünkü davranış birebir (q zorunlu, min 2 karakter → `QUERY_TOO_SHORT`).
 *
 * Gerekçe: kanal detayının Medya/Bağlantılar/Dosyalar sekmeleri ortam ucuna (`in=<channelId>`)
 * gidiyordu; DM'in `guildId`'si olmadığı için o yol DM'de kullanılamıyordu. Uç kanal kapsamlısına
 * taşındı → ortam kanalı ve DM tek yoldan akıyor, istemcide dallanma kalmadı.
 */
export interface ChannelSearchParams {
  q?: string;
  has?: 'link' | 'image' | 'file';
  before?: string;
}

/** Sunucu sonucu kanal bazında gruplayıp döner (`searchGuildMessages` dönüşü birebir). */
export interface GuildSearchGroupDto {
  channelId: string;
  channelName: string;
  messages: MessageDto[];
}

/** C35 §2.5 - gelen webhook embed'i (yalniz izinli alanlar; gorsel alani yok). */
export interface MessageEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: { name: string; url?: string };
  fields?: { name: string; value: string; inline: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

export interface MessageDto {
  id: string;
  channelId: string;
  content: string;
  replyToId: string | null;
  replyTo?: ReplyPreviewDto | null;
  author: MessageAuthorDto;
  createdAt: string;
  editedAt: string | null;
  attachments?: AttachmentDto[];
  mentions?: string[];
  mentionsEveryone?: boolean;
  pinnedAt: string | null;
  reactions?: ReactionDto[];
  /** C35 - gelen webhook mesaji: `author` webhook kimligidir (oluşturanın id'si yok). Eski sunucuda alan yok. */
  webhook?: { id: string } | null;
  embeds?: MessageEmbed[] | null;
  /** C29 — sunucu, istekteki `nonce`'u cevapta ve `message.created`'da aynen yankılar. */
  nonce?: string;
  /** C29 — YALNIZ yerel (sunucudan gelmez): geçici (iyimser) mesajın durumu ve hata metni. */
  localStatus?: 'sending' | 'failed';
  localError?: string;
}

export const messagesApi = {
  // Sözleşme §3 — cursor tabanlı, 50 sabit limit (backend `take=50`, HTTP yüzeyinde ayarlanabilir
  // limit yok — controller yalnız `before` alır).
  async list(channelId: string, before?: string): Promise<MessageDto[]> {
    const res = await http.get<MessageDto[]>(`/channels/${channelId}/messages`, {
      params: before ? { before } : undefined,
    });
    return res.data;
  },
  /**
   * `replyToId` — M1d-C §2.5. Uç bunu M1a'dan beri destekliyordu, mobil yalnız göndermiyordu.
   *
   * Sprint M3c §3 — `attachmentIds` (presign + PUT sonrası). 🔴 **`content` opsiyoneldir**: en az
   * bir ek varsa boş metin geçerlidir (`CreateMessageDto` `@IsOptional`, servis `EMPTY_MESSAGE`
   * kuralı). Boş string GÖNDERİLMEZ — `@IsNotEmpty` onu reddediyor, alan hiç yazılmaz.
   */
  async send(
    channelId: string,
    content: string,
    replyToId?: string,
    attachmentIds?: string[],
    /** C29 — yalnız iyimser (metin) gönderimde; sunucu aynen yankılar. */
    nonce?: string,
  ): Promise<MessageDto> {
    const res = await http.post<MessageDto>(`/channels/${channelId}/messages`, {
      ...(content ? { content } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(attachmentIds?.length ? { attachmentIds } : {}),
      ...(nonce ? { nonce } : {}),
    });
    return res.data;
  },
  // Sözleşme §3.5 — kanal içi mesaj arama (case-insensitive, max 30 sonuç, backend'de `q` verildiğinde
  // min 2 karakter zorunlu — `messages.controller.ts` `searchMessages`).
  //
  // M3b §5.1 — imza tek parametre nesnesine çevrildi ve `has` süzgeci eklendi. İKİNCİ BİR METOT
  // AÇILMADI: aynı uca giden iki fonksiyon, ileride biri değişip diğeri unutulduğunda sessizce
  // ayrışırdı (M3'ün `resolveMentionPreview` dersi).
  async search(channelId: string, params: ChannelSearchParams): Promise<MessageDto[]> {
    const res = await http.get<MessageDto[]>(`/channels/${channelId}/messages/search`, {
      // Boş alanlar sorguya HİÇ girmez (ortam ucundaki `searchGuild` ile aynı disiplin).
      params: Object.fromEntries(Object.entries(params).filter(([, v]) => v)),
    });
    return res.data;
  },

  /**
   * Sprint M1g §2.2 — **ortam geneli** mesaj arama. `GET /guilds/:id/messages/search`
   * (`GuildSearchController`), sonuç **kanal-gruplu** döner.
   *
   * 🔴 Erişim kapıları SUNUCUDA: yaş kapılı kanallar minöre, özel kanallar üye olmayana hiç
   * dönmüyor; `in` erişilemeyen bir kanalı gösterirse boş sonuç veriyor (sızıntı yok). İstemci
   * bunları taklit ETMEZ, ne gelirse onu listeler.
   *
   * `q` opsiyonel: doluysa sunucu ≥2 karakter şartı koyuyor (`QUERY_TOO_SHORT`), boşsa yalnız
   * filtrelerle arama yapılır (örn. "bu kanaldaki tüm dosyalar").
   */
  async searchGuild(guildId: string, params: GuildSearchParams): Promise<GuildSearchGroupDto[]> {
    const res = await http.get<GuildSearchGroupDto[]>(`/guilds/${guildId}/messages/search`, {
      // Boş alanlar sorguya HİÇ girmez — sunucu boş string'i "yok say" olarak ele alıyor ama
      // gereksiz parametre göndermenin de anlamı yok.
      params: Object.fromEntries(Object.entries(params).filter(([, v]) => v)),
    });
    return res.data;
  },

  // ─── M1d-C §2.4 — mesaj aksiyonları ────────────────────────────────────────
  // 🔴 Yetki kuralları SUNUCUDA ve mobil onları taklit etmez, yalnız satırı render edip etmemeye
  // karar verir: düzenleme ve silme **yalnız yazar** (`messages.controller.ts` "yalnız yazar"),
  // tepki her üye, sabitleme guild'de admin / DM'de üye. Sunucu 403 dönerse mesajı gösteririz.

  /**
   * Sprint M1h — sabitleme. Uçlar M1a'dan beri duruyordu, mobil çağırmıyordu (M1d-C'de bilinçle
   * atlanmıştı: sabitlenenler yüzeyi yokken sabitlemek "görülemeyen sonuç" olurdu — artık yüzey var).
   *
   * 🔴 Sunucu davranışı: **idempotent** (zaten sabitliyse no-op) ve **kanal başına 50 sınırı**
   * (aşılırsa 409 + Türkçe mesaj). Yetki: ortamda `MANAGE_MESSAGES`, DM/grup DM'de üyelik yeter.
   */
  async pin(channelId: string, messageId: string): Promise<null> {
    const res = await http.post<null>(`/channels/${channelId}/messages/${messageId}/pin`);
    return res.data;
  },
  async unpin(channelId: string, messageId: string): Promise<null> {
    const res = await http.delete<null>(`/channels/${channelId}/messages/${messageId}/pin`);
    return res.data;
  },
  /** `GET /channels/:id/pins` — `pinnedAt desc`. **Kanal başına**, ortam geneli uç yok. */
  async listPins(channelId: string): Promise<MessageDto[]> {
    const res = await http.get<MessageDto[]>(`/channels/${channelId}/pins`);
    return res.data;
  },

  async edit(channelId: string, messageId: string, content: string): Promise<MessageDto> {
    const res = await http.patch<MessageDto>(`/channels/${channelId}/messages/${messageId}`, { content });
    return res.data;
  },

  async remove(channelId: string, messageId: string): Promise<null> {
    const res = await http.delete<null>(`/channels/${channelId}/messages/${messageId}`);
    return res.data;
  },

  /**
   * Idempotent: aynı emoji ikinci kez eklenirse sunucu no-op yapar. C46: kişinin mesajda BAŞKA
   * emojisi varsa sunucu eskisini kaldırıp yenisini ekler (WS: `reaction.removed` sonra `reaction.added`).
   */
  async addReaction(channelId: string, messageId: string, emoji: string): Promise<null> {
    const res = await http.post<null>(`/channels/${channelId}/messages/${messageId}/reactions`, { emoji });
    return res.data;
  },

  async removeReaction(channelId: string, messageId: string, emoji: string): Promise<null> {
    // Emoji URL segmenti — kodlanmadan gönderilirse çok baytlı karakterler yolu bozar.
    const res = await http.delete<null>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    );
    return res.data;
  },

  /** C46 §3 — kimler tepki verdi. Envelope `data` = `ReactionGroupDto[]`. */
  async listReactions(channelId: string, messageId: string): Promise<ReactionGroupDto[]> {
    const res = await http.get<ReactionGroupDto[]>(`/channels/${channelId}/messages/${messageId}/reactions`);
    return res.data;
  },
};
