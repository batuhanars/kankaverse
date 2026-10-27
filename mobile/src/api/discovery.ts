import http from './http';
import type { GuildSummaryDto } from './guilds';

// Sprint C18 §1 — Keşfet. Tipler web `DiscoveryGuildDto` / `DiscoveryListDto` ile aynı şekil
// (web/src/types/index.ts, OpenAPI kaynağı). adultsOnly süzmesi ve katılma kapıları (yaş, ban,
// zaten üye) SUNUCUDA; istemci ek süzme yapmaz.
export interface DiscoveryGuildDto {
  id: string;
  name: string;
  iconUrl: string | null;
  /** C19 §7: hareketli simge (WebP); normal Image ile gosterilir. */
  iconAnimatedUrl?: string | null;
  bannerColor: string | null;
  bannerUrl: string | null;
  /** C19: hareketli afiş (WebP). */
  bannerAnimatedUrl?: string | null;
  description: string | null;
  memberCount: number;
  tags: string[];
  adultsOnly: boolean;
}

export interface DiscoveryListDto {
  items: DiscoveryGuildDto[];
  nextCursor: string | null;
}

export const discoveryApi = {
  // Sunucu arama parametresi `search` (web `discoveryApi.listGuilds` ile aynı).
  async listGuilds(params: { search?: string; cursor?: string } = {}): Promise<DiscoveryListDto> {
    const res = await http.get<DiscoveryListDto>('/discovery/guilds', { params });
    return res.data;
  },

  async joinDiscovery(guildId: string): Promise<GuildSummaryDto> {
    const res = await http.post<GuildSummaryDto>(`/guilds/${guildId}/join-discovery`);
    return res.data;
  },
};
