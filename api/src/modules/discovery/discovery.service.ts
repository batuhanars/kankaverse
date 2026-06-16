import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DiscoveryGuildDto,
  DiscoveryGuildListDto,
  DiscoveryTagDto,
} from './dto/discovery-guild.dto';
import { ListDiscoveryQueryDto } from './dto/list-discovery-query.dto';

const PAGE_LIMIT = 30; // sayfa başı en fazla kart (≤30 — sözleşme)
const TOP_TAGS = 20; // /discovery/tags için döndürülecek en popüler etiket sayısı

@Injectable()
export class DiscoveryService {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /discovery/guilds — discoverable ortamlar (üye olsun olmasın herkese açık).
   *
   * [R7 KRİTİK] adultsOnly süzme viewer.isMinor'a bağlıdır: minör görüntüleyici
   * adultsOnly=true ortamları SONUÇTA GÖRMEZ (where: { adultsOnly: false } eklenir).
   * Yetişkin tümünü görür. isMinor JWT'de taşınmadığı için DB'den okunur (yetki-katmanına dokunmadan).
   *
   * Sıralama memberCount azalan; sayfalama imleci = sayısal offset (basit, deterministik).
   */
  async listGuilds(viewerId: string, query: ListDiscoveryQueryDto): Promise<DiscoveryGuildListDto> {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { isMinor: true },
    });
    const isMinor = viewer?.isMinor ?? true; // fail-closed: belirsizse minör kabul et

    const tagNormalized = query.tag?.trim().toLowerCase();
    const search = query.search?.trim();

    const where: Prisma.GuildWhereInput = {
      discoverable: true,
      deletedAt: null,
      // [R7 KRİTİK] minör görüntüleyici → adultsOnly ortamlar süzülür
      ...(isMinor ? { adultsOnly: false } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      ...(tagNormalized ? { tags: { has: tagNormalized } } : {}),
    };

    const offset = this.decodeCursor(query.cursor);

    const guilds = await this.prisma.guild.findMany({
      where,
      include: { _count: { select: { members: true } } },
      orderBy: [{ members: { _count: 'desc' } }, { createdAt: 'asc' }],
      skip: offset,
      take: PAGE_LIMIT + 1, // +1 ile sonraki sayfa var mı tespiti
    });

    const hasMore = guilds.length > PAGE_LIMIT;
    const page = hasMore ? guilds.slice(0, PAGE_LIMIT) : guilds;

    const items: DiscoveryGuildDto[] = page.map((g) => ({
      id: g.id,
      name: g.name,
      iconUrl: g.iconUrl,
      bannerColor: g.bannerColor ?? null,
      description: g.description ?? null,
      memberCount: g._count.members,
      tags: g.tags,
      adultsOnly: g.adultsOnly,
    }));

    return {
      items,
      nextCursor: hasMore ? String(offset + PAGE_LIMIT) : null,
    };
  }

  /**
   * GET /discovery/tags — discoverable ortamların etiketlerinden agregat (top N, azalan).
   *
   * Düşük hacim: discoverable guild tags'lerini çek, JS'te say. adultsOnly çip sayımı
   * görüntüleyiciye göre süzülmez (çip listesi keşif yardımcısı; kart listesi zaten süzülü).
   */
  async popularTags(): Promise<DiscoveryTagDto[]> {
    const guilds = await this.prisma.guild.findMany({
      where: { discoverable: true, deletedAt: null },
      select: { tags: true },
    });

    const counts = new Map<string, number>();
    for (const g of guilds) {
      for (const tag of g.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'tr'))
      .slice(0, TOP_TAGS);
  }

  /** Cursor decode — sayısal offset; geçersiz/boş → 0 (fail-safe ilk sayfa). */
  private decodeCursor(cursor?: string): number {
    if (!cursor) return 0;
    const n = Number.parseInt(cursor, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
}
