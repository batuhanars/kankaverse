import http from './http';

// Sprint M1b contract §2 + §3.6 — `GET /users/:id/card` → `UserProfileCardDto`
// (api/src/modules/users/users.service.ts). Backend DTO'su çok daha zengin (bio/banner/mutual/
// roller/ses durumu — C10 sprint'i), ama M1b yalnız engelle/arkadaşlıktan-çıkar KARARI için
// gereken alt kümeyi kullanıyor. Rule of Three deseni (bkz. api/channels.ts yorumu): kullanılmayan
// alanlar tiplenmedi.
export interface UserCardDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  friendStatus: 'none' | 'friends' | 'pending_in' | 'pending_out' | 'self';
  selfBlocked: boolean;
}

export const usersApi = {
  async getCard(userId: string): Promise<UserCardDto> {
    const res = await http.get<UserCardDto>(`/users/${userId}/card`);
    return res.data;
  },
};
