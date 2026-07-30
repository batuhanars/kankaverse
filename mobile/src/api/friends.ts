import http from './http';

// Sprint M1b contract §2 + api/src/modules/friends/friends.controller.ts — alan adları
// backend'in dönüş şeklinden birebir okundu (`friends.service.ts` `toFriendCodeUserDto` +
// `getFriends`/`getFriendRequests`). Kullanıcı adıyla arama/ekleme ucu YOK (T&S duruşu, sözleşme
// §3.1) — bu dosyada da öyle bir çağrı yok.
export interface FriendUserDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface FriendDto {
  friendshipId: string;
  user: FriendUserDto;
  since: string;
}

export interface FriendRequestDto {
  id: string;
  direction: 'incoming' | 'outgoing';
  user: FriendUserDto;
  createdAt: string;
}

export const friendsApi = {
  async list(): Promise<FriendDto[]> {
    const res = await http.get<FriendDto[]>('/friends');
    return res.data;
  },
  async listRequests(): Promise<FriendRequestDto[]> {
    const res = await http.get<FriendRequestDto[]>('/friends/requests');
    return res.data;
  },
  // Dönüş şekli 'accepted'/'requested' discriminated union'dır (friends.service.ts
  // executeFriendshipCreation); mobil bunu tüketmiyor, başarı sonrası store fetchAll ile tazelenir.
  async sendRequest(friendCode: string): Promise<unknown> {
    const res = await http.post<unknown>('/friends/requests', { friendCode });
    return res.data;
  },
  async acceptRequest(requestId: string): Promise<unknown> {
    const res = await http.post<unknown>(`/friends/requests/${requestId}/accept`);
    return res.data;
  },
  async declineRequest(requestId: string): Promise<null> {
    const res = await http.post<null>(`/friends/requests/${requestId}/decline`);
    return res.data;
  },
  async remove(userId: string): Promise<null> {
    const res = await http.delete<null>(`/friends/${userId}`);
    return res.data;
  },
};
