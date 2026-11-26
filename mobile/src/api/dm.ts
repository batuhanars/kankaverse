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

/** C62 — gruptan ayrılan/çıkarılan kullanıcının eski grubu: `leftAt` sonrası mesaj yok, yazma/okundu kapalı. */
export interface DmDepartedDto {
  leftAt: string;
  reason: 'LEFT' | 'REMOVED';
}

/** C67 — bir üyenin bu kanalı okuduğu an. Sunucu kimin görülebileceğine karar verir (R7); istemci süzmez. */
export interface SeenByDto {
  userId: string;
  readAt: string;
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
      /** C67 — okuyucu avatarları. Eski alanlar geriye uyum için durur, tik çiziminde KULLANILMAZ. */
      seenBy?: SeenByDto[];
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
      seenBy?: SeenByDto[];
      /** C62 — null/yok = aktif grup; dolu = eski grup (salt okunur, yalnız "Sohbeti sil"). */
      departed?: DmDepartedDto | null;
    };

/** C64 - grup DM uyelik olayi (mesaj DEGIL): ekleme / ayrilma / cikarma. `actor` ayrilmada null. */
export interface GroupDmEventDto {
  id: string;
  channelId: string;
  kind: 'MEMBER_ADDED' | 'MEMBER_LEFT' | 'MEMBER_REMOVED';
  actor: { id: string; username: string } | null;
  target: { id: string; username: string };
  createdAt: string;
}

export interface MessageRequestDto {
  channelId: string;
  requester: DmParticipantDto | null;
  preview: string;
  /** E1 — yalnız şifreliyse true: önizleme "Şifreli mesaj" gösterilir. */
  encrypted?: boolean;
  /** C75 Rev.6 — istekler ekranı açılınca görüldü sayılır; rozet yalnız görülmemişi sayar. */
  unseen?: boolean;
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
  /** C75 Rev.7: tek istek görüldü (alıcıya özel; istek sahibine okundu bilgisi gitmez). */
  async markRequestSeen(channelId: string): Promise<null> {
    const res = await http.post<null>(`/dm/requests/${channelId}/seen`);
    return res.data;
  },
  /** C75 Rev.7: Tümünü reddet. Yalnız gönderilen kimlikler; engelleme yok. */
  async rejectRequestsBatch(channelIds: string[]): Promise<{ rejected: string[] }> {
    const res = await http.post<{ rejected: string[] }>('/dm/requests/reject-batch', { channelIds });
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
  /** C64 - grubun uyelik olaylari (eskiden yeniye, en cok son 200). */
  async listGroupEvents(groupId: string): Promise<GroupDmEventDto[]> {
    const res = await http.get<GroupDmEventDto[]>(`/dm/groups/${groupId}/events`);
    return res.data;
  },
  /** C62 — eski grup sohbetini yalnız kendi listemden sil (yoksa 404 DEPARTURE_NOT_FOUND). */
  async deleteDeparture(groupId: string): Promise<null> {
    const res = await http.delete<null>(`/dm/groups/${groupId}/departure`);
    return res.data;
  },
  async renameGroup(groupId: string, name: string): Promise<RenameGroupResultDto> {
    const res = await http.patch<RenameGroupResultDto>(`/dm/groups/${groupId}`, { name });
    return res.data;
  },
};
