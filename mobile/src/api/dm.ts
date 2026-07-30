import http from './http';
import type { MessageDto } from './messages';

// Sprint M1a contract §3 + api/src/modules/dm/dm.service.ts (toDmChannelDto/getMessageRequests) —
// discriminated union birebir web/src/types/index.ts DmChannelDto'dan taşındı (dosyadan doğrulandı).
export interface DmParticipantDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export type DmChannelDto =
  | {
      type: 'DM';
      id: string;
      otherUser: DmParticipantDto;
      lastMessage: MessageDto | null;
      unread: boolean;
      canMessage: boolean;
      selfBlocked: boolean;
      // C9 — mesaj isteği: null = normal DM · 'PENDING'/'ACCEPTED' = istek.
      requestStatus?: 'PENDING' | 'ACCEPTED' | null;
      requestOutgoing?: boolean;
    }
  | {
      type: 'GROUP_DM';
      id: string;
      name: string | null;
      ownerId: string;
      members: DmParticipantDto[];
      lastMessage: MessageDto | null;
      unread: boolean;
    };

export interface MessageRequestDto {
  channelId: string;
  requester: DmParticipantDto | null;
  preview: string;
  createdAt: string;
}

export const dmApi = {
  async listChannels(): Promise<DmChannelDto[]> {
    const res = await http.get<DmChannelDto[]>('/dm/channels');
    return res.data;
  },
  async markRead(channelId: string): Promise<null> {
    const res = await http.post<null>(`/dm/channels/${channelId}/read`);
    return res.data;
  },
  async listRequests(): Promise<MessageRequestDto[]> {
    const res = await http.get<MessageRequestDto[]>('/dm/requests');
    return res.data;
  },
  async acceptRequest(channelId: string): Promise<DmChannelDto> {
    const res = await http.post<DmChannelDto>(`/dm/requests/${channelId}/accept`);
    return res.data;
  },
  async rejectRequest(channelId: string, block: boolean): Promise<null> {
    const res = await http.post<null>(`/dm/requests/${channelId}/reject`, { block });
    return res.data;
  },
};
