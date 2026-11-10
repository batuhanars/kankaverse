import http from './http';
import type { MessageDto } from './messages';

// Sprint M1a contract §3 + api/src/modules/dm/dm.service.ts (toDmChannelDto/getMessageRequests) —
// discriminated union birebir web/src/types/index.ts DmChannelDto'dan taşındı (dosyadan doğrulandı).
export interface DmParticipantDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

// C46 §4b — DM/grup satırı tepki göstergesi (sunucu süzer: okunmamış, son mesajdan yeni, aktör engelsiz)
export interface DmLastReactionDto {
  actorId: string;
  actorUsername: string;
  emoji: string;
  messageId: string;
  at: string;
}

export type DmChannelDto =
  | {
      type: 'DM';
      id: string;
      otherUser: DmParticipantDto;
      lastMessage: MessageDto | null;
      unread: boolean;
      lastReaction?: DmLastReactionDto | null;
      canMessage: boolean;
      selfBlocked: boolean;
      // C9 — mesaj isteği: null = normal DM · 'PENDING'/'ACCEPTED' = istek.
      requestStatus?: 'PENDING' | 'ACCEPTED' | null;
      requestOutgoing?: boolean;
      // C12 §3.2 — İKİ AYRI ALAN, karıştırma:
      //   receiptsEnabled: tik çizilecek mi (gizlilik kapısı) → false ise gösterge HİÇ çizilmez.
      //   otherReadAt    : karşı tarafın okuma anı; null = henüz hiç okumamış → TEK tik.
      receiptsEnabled?: boolean;
      otherReadAt?: string | null;
    }
  | {
      type: 'GROUP_DM';
      id: string;
      name: string | null;
      ownerId: string;
      /** Kurucunun atadığı yöneticiler (kurucu hariç). Eski önbellekte alan yok → yönetici yok. */
      adminIds?: string[];
      members: DmParticipantDto[];
      lastMessage: MessageDto | null;
      unread: boolean;
      lastReaction?: DmLastReactionDto | null;
      // C34 — grup okundu: receiptsEnabled gizlilik kapısı; groupAllReadAt = uygun üyelerin HEPSİ
      // en az bu ana kadar okudu (biri hiç okumadıysa null → tek tik). Bireysel okuma anı yoktur.
      receiptsEnabled?: boolean;
      groupAllReadAt?: string | null;
    };

export interface MessageRequestDto {
  channelId: string;
  requester: DmParticipantDto | null;
  preview: string;
  /** E1 — yalnız şifreliyse true: önizleme "Şifreli mesaj" gösterilir. */
  encrypted?: boolean;
  createdAt: string;
}

// Sprint M1b contract §2 — grup üye ekleme yanıtı (`dm.service.ts` `addGroupMember` dönüşü) +
// grup yeniden adlandırma yanıtı. Ayrı arayüzler: farklı uçların gerçek şekli farklı (Rule of Three
// ihlali değil, iki farklı veri).
export type AddedGroupMemberDto = DmParticipantDto;
export interface RenameGroupResultDto {
  id: string;
  name: string | null;
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
  // Sözleşme §3.2 — DM başlat. Kanal zaten varsa sunucu MEVCUT olanı döner (kopya açmaz);
  // istemci dönen id ile store'da eşleştirir (bkz. stores/dm.ts createChannel).
  async createChannel(userId: string): Promise<DmChannelDto> {
    const res = await http.post<DmChannelDto>('/dm/channels', { userId });
    return res.data;
  },
  // Sözleşme §3.6 / G4 — "Sohbeti temizle" (soft-delete: yalnız çağıranın clearedAt'i).
  async clearChannel(channelId: string): Promise<null> {
    const res = await http.delete<null>(`/dm/channels/${channelId}`);
    return res.data;
  },
  // Sözleşme §3.3 — Grup DM kur. `memberIds` 1-9 arası (`create-group-dm.dto.ts` `@ArrayMaxSize(9)`).
  async createGroup(memberIds: string[], name?: string): Promise<DmChannelDto> {
    const res = await http.post<DmChannelDto>('/dm/groups', { memberIds, name });
    return res.data;
  },
  async addGroupMember(groupId: string, userId: string): Promise<AddedGroupMemberDto> {
    const res = await http.post<AddedGroupMemberDto>(`/dm/groups/${groupId}/members`, { userId });
    return res.data;
  },
  async removeGroupMember(groupId: string, userId: string): Promise<null> {
    const res = await http.delete<null>(`/dm/groups/${groupId}/members/${userId}`);
    return res.data;
  },
  /** Grup yöneticisi ver/al — yalnız kurucu (sunucu kapısı). */
  async setGroupAdmin(groupId: string, userId: string, isAdmin: boolean): Promise<void> {
    const url = `/dm/groups/${groupId}/admins/${userId}`;
    if (isAdmin) await http.put(url);
    else await http.delete(url);
  },
  async leaveGroup(groupId: string): Promise<null> {
    const res = await http.delete<null>(`/dm/groups/${groupId}/members/me`);
    return res.data;
  },
  async deleteGroup(groupId: string): Promise<null> {
    const res = await http.delete<null>(`/dm/groups/${groupId}`);
    return res.data;
  },
  async renameGroup(groupId: string, name: string): Promise<RenameGroupResultDto> {
    const res = await http.patch<RenameGroupResultDto>(`/dm/groups/${groupId}`, { name });
    return res.data;
  },
};
