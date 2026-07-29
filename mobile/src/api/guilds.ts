import http from './http';

// Sprint M0 contract §8, ekran 3 — yalnız "ikon + ad" gösteriliyor; DTO'nun tamamı (web
// GuildDto — web/src/types/index.ts) M0'da tüketilmiyor, bu yüzden yalnız kullanılan alt küme
// tiplendi (Rule of Three: kullanılmayan alanı tiplemek erken soyutlama).
export interface GuildSummaryDto {
  id: string;
  name: string;
  iconUrl: string | null;
}

export const guildsApi = {
  async list(): Promise<GuildSummaryDto[]> {
    const res = await http.get<GuildSummaryDto[]>('/guilds');
    return res.data;
  },
};
