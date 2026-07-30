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
  async send(channelId: string, content: string): Promise<MessageDto> {
    const res = await http.post<MessageDto>(`/channels/${channelId}/messages`, { content });
    return res.data;
  },
};
