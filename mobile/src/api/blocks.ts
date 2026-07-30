import http from './http';

// Sprint M1b contract §2 + api/src/modules/blocks/blocks.controller.ts — yalnız profil kartı
// aksiyonları için gereken iki uç (engelle/kaldır). `GET /blocks` (engellenenler listesi) bu
// sprintte hiçbir ekranda kullanılmıyor (M1b'de "engellenenler" ekranı yok) → eklenmedi; kullanılmayan
// API fonksiyonu yazmak da bir tür boş yüzeydir.
export const blocksApi = {
  async block(userId: string): Promise<null> {
    const res = await http.post<null>('/blocks', { userId });
    return res.data;
  },
  async unblock(userId: string): Promise<null> {
    const res = await http.delete<null>(`/blocks/${userId}`);
    return res.data;
  },
};
