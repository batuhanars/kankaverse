import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { toGuildDto } from './guilds.service';
import { DEFAULT_EVERYONE_PERMISSIONS } from '../../common/permissions';

/**
 * DiscordImportService — Discord "Sunucu Şablonu" (Server Template) → Kankaverse Ortam.
 * Yalnız YAPI taşınır: kategori + kanal + rol iskeleti. Üye/mesaj/medya/emoji TAŞINMAZ
 * (KVKK + çocuk-güvenliği: kullanıcı içeriği hiç içeri girmez). Resmi, public template
 * API'sinden sunucu-tarafı okunur (OAuth/self-bot YOK). Bayrak: discordImportEnabled.
 */

// Discord izin biti → Kankaverse PERMISSION_FLAGS eşlemesi (yakın eşleme; lossy).
const DISCORD_PERM_BITS: { bit: bigint; flag: string }[] = [
  { bit: 1n << 3n, flag: 'ADMINISTRATOR' },
  { bit: 1n << 10n, flag: 'VIEW_CHANNELS' },
  { bit: 1n << 4n, flag: 'MANAGE_CHANNELS' },
  { bit: 1n << 28n, flag: 'MANAGE_ROLES' },
  { bit: 1n << 5n, flag: 'MANAGE_GUILD' },
  { bit: 1n << 1n, flag: 'KICK_MEMBERS' },
  { bit: 1n << 2n, flag: 'BAN_MEMBERS' },
  { bit: 1n << 13n, flag: 'MANAGE_MESSAGES' },
  { bit: 1n << 17n, flag: 'MENTION_EVERYONE' },
  { bit: 1n << 30n, flag: 'MANAGE_EMOJIS' },
  { bit: 1n << 0n, flag: 'CREATE_INVITE' },
  { bit: 1n << 26n, flag: 'CHANGE_NICKNAME' },
  { bit: 1n << 27n, flag: 'MANAGE_NICKNAMES' },
  { bit: 1n << 22n, flag: 'MUTE_MEMBERS' },
  { bit: 1n << 24n, flag: 'MOVE_MEMBERS' },
  { bit: 1n << 8n, flag: 'PRIORITY_SPEAKER' },
  { bit: 1n << 33n, flag: 'MANAGE_EVENTS' },
];

function mapPermissions(permissions: string | undefined): string[] {
  if (!permissions) return [];
  let bits: bigint;
  try {
    bits = BigInt(permissions);
  } catch {
    return [];
  }
  return DISCORD_PERM_BITS.filter((p) => (bits & p.bit) === p.bit).map((p) => p.flag);
}

// Discord kanal tipi → bizim tip (null = desteklenmiyor, atla)
function mapChannelType(type: number): 'GUILD_TEXT' | 'GUILD_VOICE' | 'CATEGORY' | null {
  switch (type) {
    case 0: // GUILD_TEXT
    case 5: // GUILD_ANNOUNCEMENT → en yakını metin
      return 'GUILD_TEXT';
    case 2: // GUILD_VOICE
    case 13: // GUILD_STAGE_VOICE → en yakını ses
      return 'GUILD_VOICE';
    case 4: // GUILD_CATEGORY
      return 'CATEGORY';
    default: // forum (15), thread (10/11/12), media (16) ...
      return null;
  }
}

// Kanal adı kuralımız: küçük harf + rakam + tire (2-50). Discord adlarını normalize et.
function normalizeChannelName(name: string): string {
  let n = (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-') // emoji/boşluk/aksanlı → tire
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (n.length < 2) n = 'kanal';
  return n.slice(0, 50);
}

function clampName(name: string, fallback: string): string {
  const n = (name ?? '').trim();
  return (n.length === 0 ? fallback : n).slice(0, 50);
}

// Discord template kodunu çeşitli link biçimlerinden çıkar (discord.new/CODE, discord.com/template/CODE, ham kod)
function extractTemplateCode(input: string): string | null {
  const raw = (input ?? '').trim();
  // URL içindeyse son anlamlı parçayı al
  const m = raw.match(/(?:templates?\/|discord\.new\/)([A-Za-z0-9-]+)/);
  const code = m ? m[1] : raw;
  // Ham kod: alfanümerik + tire, makul uzunluk
  return /^[A-Za-z0-9-]{1,64}$/.test(code) ? code : null;
}

interface SerializedRole {
  id: number | string;
  name: string;
  permissions?: string;
  color?: number;
  hoist?: boolean;
  mentionable?: boolean;
}
interface SerializedChannel {
  id: number | string;
  name: string;
  type: number;
  position?: number;
  topic?: string | null;
  nsfw?: boolean;
  parent_id?: number | string | null;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
}

@Injectable()
export class DiscordImportService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  /** Discord template API'sinden serialized_source_guild getir. */
  private async fetchTemplate(code: string): Promise<{ name: string; roles: SerializedRole[]; channels: SerializedChannel[] }> {
    // TR'de Discord DPI ile engelli → TR sunucusu discord.com'a çıkamaz. Ayarlıysa TR-dışı
    // bir proxy (örn. Cloudflare Worker) üzerinden geç; yoksa doğrudan (dev/TR-dışı).
    const proxy = process.env.DISCORD_TEMPLATE_PROXY?.trim();
    const secret = process.env.DISCORD_TEMPLATE_PROXY_SECRET?.trim();
    const url = proxy
      ? `${proxy}${proxy.includes('?') ? '&' : '?'}code=${encodeURIComponent(code)}`
      : `https://discord.com/api/v10/guilds/templates/${code}`;
    const headers: Record<string, string> = { 'User-Agent': 'Kankaverse (https://kankaverse.com, 1.0)' };
    if (proxy && secret) headers['x-proxy-secret'] = secret;

    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch {
      throw new BadRequestException({ message: 'Discord şablonu alınamadı (ağ hatası).', error: 'TEMPLATE_FETCH_FAILED' });
    }
    if (res.status === 404) {
      throw new BadRequestException({ message: 'Şablon bulunamadı veya süresi dolmuş.', error: 'TEMPLATE_NOT_FOUND' });
    }
    if (!res.ok) {
      throw new BadRequestException({ message: 'Discord şablonu alınamadı.', error: 'TEMPLATE_FETCH_FAILED' });
    }
    const data = (await res.json()) as {
      name?: string;
      serialized_source_guild?: { roles?: SerializedRole[]; channels?: SerializedChannel[] };
    };
    const src = data.serialized_source_guild;
    if (!src || !Array.isArray(src.channels)) {
      throw new BadRequestException({ message: 'Şablon içeriği okunamadı.', error: 'TEMPLATE_INVALID' });
    }
    return { name: data.name ?? 'Discord Ortamı', roles: src.roles ?? [], channels: src.channels };
  }

  async importTemplate(userId: string, input: string, nameOverride?: string) {
    const code = extractTemplateCode(input);
    if (!code) {
      throw new BadRequestException({ message: 'Geçersiz şablon linki veya kodu.', error: 'INVALID_TEMPLATE' });
    }

    const tpl = await this.fetchTemplate(code);
    const guildName = clampName(nameOverride ?? tpl.name, 'Discord Ortamı');

    // Discord renk integer → #RRGGBB (0 = renksiz → varsayılan)
    const toHex = (c?: number) => (c && c > 0 ? '#' + c.toString(16).padStart(6, '0') : '#99AAB5');

    const result = await this.prisma.$transaction(async (tx) => {
      const guild = await tx.guild.create({ data: { name: guildName, ownerId: userId } });
      await tx.guildMember.create({ data: { guildId: guild.id, userId, role: 'OWNER' } });

      // Roller: Discord @everyone (id 0 / name '@everyone') → bizim isEveryone rolü; diğerleri normal rol.
      const everyone = tpl.roles.find((r) => String(r.id) === '0' || r.name === '@everyone');
      await tx.role.create({
        data: {
          guildId: guild.id,
          name: '@everyone',
          color: '#99AAB5',
          position: 0,
          hoist: false,
          mentionable: false,
          permissions: everyone ? mapPermissions(everyone.permissions) : DEFAULT_EVERYONE_PERMISSIONS,
          isEveryone: true,
        },
      });

      const otherRoles = tpl.roles
        .filter((r) => !(String(r.id) === '0' || r.name === '@everyone'))
        .slice(0, 100); // makul üst sınır
      let rolePos = 1;
      for (const r of otherRoles) {
        await tx.role.create({
          data: {
            guildId: guild.id,
            name: clampName(r.name, 'rol'),
            color: toHex(r.color),
            position: rolePos++,
            hoist: !!r.hoist,
            mentionable: !!r.mentionable,
            permissions: mapPermissions(r.permissions),
            isEveryone: false,
          },
        });
      }

      // Kategoriler önce (placeholder id → gerçek kategori id haritası)
      const categories = tpl.channels.filter((c) => mapChannelType(c.type) === 'CATEGORY').slice(0, 50);
      const catMap = new Map<string, string>();
      let catPos = 0;
      for (const c of categories) {
        const cat = await tx.channelCategory.create({
          data: { guildId: guild.id, name: clampName(c.name, 'kategori'), position: c.position ?? catPos++ },
        });
        catMap.set(String(c.id), cat.id);
      }

      // Kanallar (kategori-dışı), parent_id → kategori id
      const channels = tpl.channels
        .filter((c) => { const t = mapChannelType(c.type); return t === 'GUILD_TEXT' || t === 'GUILD_VOICE'; })
        .slice(0, 200);
      let chPos = 0;
      for (const c of channels) {
        const type = mapChannelType(c.type) as 'GUILD_TEXT' | 'GUILD_VOICE';
        const categoryId = c.parent_id != null ? catMap.get(String(c.parent_id)) ?? null : null;
        await tx.channel.create({
          data: {
            guildId: guild.id,
            type,
            name: normalizeChannelName(c.name),
            position: c.position ?? chPos++,
            categoryId,
            ageGated: !!c.nsfw,
            slowModeSeconds: Math.min(Math.max(c.rate_limit_per_user ?? 0, 0), 21600),
            ...(type === 'GUILD_VOICE' && {
              userLimit: Math.min(Math.max(c.user_limit ?? 0, 0), 99),
              ...(c.bitrate ? { bitrate: Math.min(Math.max(Math.round(c.bitrate / 1000), 8), 96) } : {}),
            }),
          },
        });
      }

      return guild;
    });

    this.realtime.emitToUser(userId, 'guild.joined', { guildId: result.id });
    return toGuildDto(result);
  }
}
