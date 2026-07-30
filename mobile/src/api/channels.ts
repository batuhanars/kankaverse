import http from './http';

// Sprint M1a contract §3 + api/src/modules/channels/channels.controller.ts — alan adları
// backend'in ChannelDto şeklinden birebir okundu. Yalnız sidebar'ın kullandığı alt küme tiplendi
// (Rule of Three — mobile/CLAUDE.md M0 emsali: kullanılmayan alanı tiplemek erken soyutlama).
export const ChannelType = {
  GUILD_TEXT: 'GUILD_TEXT',
  GUILD_VOICE: 'GUILD_VOICE',
  DM: 'DM',
  GROUP_DM: 'GROUP_DM',
} as const;
// TS "enum-like const object" deseni — değer ve tip aynı adı taşır (Handbook önerisi); ESLint
// @typescript-eslint/no-redeclare bunu declaration-merging'den ayırt edemiyor, bilinçli olarak susturuldu.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export interface ChannelSummaryDto {
  id: string;
  type: ChannelType;
  guildId: string | null;
  name: string | null;
  position: number;
  unreadCount: number;
  unreadMentionCount: number;
  categoryId: string | null;
}

export const channelsApi = {
  async listByGuild(guildId: string): Promise<ChannelSummaryDto[]> {
    const res = await http.get<ChannelSummaryDto[]>(`/guilds/${guildId}/channels`);
    return res.data;
  },
  async markRead(channelId: string): Promise<null> {
    const res = await http.post<null>(`/channels/${channelId}/read`);
    return res.data;
  },
};
