import http from './http';

// Sprint M1b contract §2 + api/src/modules/blocks/blocks.controller.ts — yalnız profil kartı
// aksiyonları için gereken iki uç (engelle/kaldır) vardı. Sprint M1d-0 contract §2 —
// `GET /blocks` (engellenenler listesi) burada eklendi: bu sprintin varlık sebebi, hiç
// DM'leşilmemiş birini engelleyince geri dönülemeyen kapıyı kapatan Engellenenler ekranı.
// Dönüş şekli kaynaktan doğrulandı (`blocks.service.ts` `getBlocks`).
export interface BlockedUserDto {
  user: { id: string; username: string; avatarUrl: string | null };
  since: string;
}

export const blocksApi = {
  async list(): Promise<BlockedUserDto[]> {
    const res = await http.get<BlockedUserDto[]>('/blocks');
    return res.data;
  },
  async block(userId: string): Promise<null> {
    const res = await http.post<null>('/blocks', { userId });
    return res.data;
  },
  async unblock(userId: string): Promise<null> {
    const res = await http.delete<null>(`/blocks/${userId}`);
    return res.data;
  },
};
