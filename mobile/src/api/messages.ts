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
}

/**
 * Sunucu tepkileri emoji bazında TOPLAYARAK döner (`messages.service.ts` `ReactionAggDto`) — kim
 * tepki vermiş listesi gelmez, yalnız sayı ve "ben verdim mi". İstemci de bu yüzden "kimler" diye
 * bir yüzey açmaz; olmayan veriyi bekleyen tasarım yapılmaz.
 */
export interface ReactionDto {
  emoji: string;
  count: number;
  reactedByMe: boolean;
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
  /** `replyToId` — M1d-C §2.5. Uç bunu M1a'dan beri destekliyordu, mobil yalnız göndermiyordu. */
  async send(channelId: string, content: string, replyToId?: string): Promise<MessageDto> {
    const res = await http.post<MessageDto>(`/channels/${channelId}/messages`, {
      content,
      ...(replyToId ? { replyToId } : {}),
    });
    return res.data;
  },
  // Sözleşme §3.5 — kanal içi mesaj arama (case-insensitive, max 30 sonuç, backend'de min 2 karakter
  // zorunlu — `messages.controller.ts` `searchMessages`). Ortam-geneli arama (`/guilds/:id/messages/
  // search`) bu sprintte KULLANILMIYOR (sözleşme §3.5 kapsam dışı notu).
  async search(channelId: string, q: string, before?: string): Promise<MessageDto[]> {
    const res = await http.get<MessageDto[]>(`/channels/${channelId}/messages/search`, {
      params: before ? { q, before } : { q },
    });
    return res.data;
  },

  // ─── M1d-C §2.4 — mesaj aksiyonları ────────────────────────────────────────
  // 🔴 Yetki kuralları SUNUCUDA ve mobil onları taklit etmez, yalnız satırı render edip etmemeye
  // karar verir: düzenleme ve silme **yalnız yazar** (`messages.controller.ts` "yalnız yazar"),
  // tepki her üye, sabitleme guild'de admin / DM'de üye. Sunucu 403 dönerse mesajı gösteririz.

  async edit(channelId: string, messageId: string, content: string): Promise<MessageDto> {
    const res = await http.patch<MessageDto>(`/channels/${channelId}/messages/${messageId}`, { content });
    return res.data;
  },

  async remove(channelId: string, messageId: string): Promise<null> {
    const res = await http.delete<null>(`/channels/${channelId}/messages/${messageId}`);
    return res.data;
  },

  /** Idempotent: aynı emoji ikinci kez eklenirse sunucu no-op yapar. */
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
};
