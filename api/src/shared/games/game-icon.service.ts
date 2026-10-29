import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * C31c §1 — oyun simgesi. İstemci Steam'e ASLA istek atmaz: simgeyi sunucu bir kez indirir, mevcut
 * görsel hattıyla (sharp) 64x64 WebP'ye çevirir, public bucket'a (cdn) yazar, `Game.iconUrl`'e kendi
 * adresimizi koyar. Arka planda çalışır (activity:set cevabını bekletmez).
 *
 * Kaynak: Steam mağaza `IStoreBrowseService/GetItems` (anahtarsız) `assets.community_icon` karması →
 * `steamcommunity/public/images/apps/<appid>/<karma>.jpg` (32x32 JPEG). Epic ve Steam karşılığı
 * olmayan elle liste oyunları null kalır.
 */

const STEAM_ITEMS_URL = 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1';
const STEAM_ICON_BASE = 'https://cdn.fastly.steamstatic.com/steamcommunity/public/images/apps';
const FETCH_TIMEOUT_MS = 5000;
const MAX_ICON_BYTES = 256 * 1024;
const ICON_SIZE = 64;
const ICON_PREFIX = 'game-icons';
const ICON_HASH = /^[0-9a-f]{40}$/;

/**
 * CURATED oyunlardan Steam'de KESİN karşılığı olanlar (slug → appid). Her biri Steam mağaza
 * `appdetails` ile ad olarak doğrulandı. Belirsizler (Call of Duty, EA FC, Tarkov...) listede yok.
 * Sonradan simge eklemek veri işidir: buraya satır eklenir.
 */
export const CURATED_STEAM_APP_IDS: Record<string, string> = {
  'apex-legends': '1172470',
  'rainbow-six-siege': '359550',
  'path-of-exile': '238960',
  'elder-scrolls-online': '306130',
  'final-fantasy-xiv': '39210',
  'black-desert': '582660',
  'albion-online': '761890',
  'battlefield-2042': '1517290',
  'the-sims-4': '1222670',
  'overwatch-2': '2357570',
  'guild-wars-2': '1284210',
  'world-of-tanks': '1407200',
  'diablo-iv': '2344520',
};

export interface IconCandidate {
  id: string;
  source: 'STEAM' | 'EPIC' | 'CURATED';
  externalId: string | null;
  iconUrl: string | null;
}

@Injectable()
export class GameIconService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GameIconService.name);
  /** Bu süreçte denenmiş oyunlar: başarısız bir simge her istekte yeniden aranmaz. */
  private readonly attempted = new Set<string>();
  private readonly listeners: Array<(gameId: string) => void> = [];

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  /** Simge yazıldığında haber ver (presence, oynayanlara güncel nesneyi yeniden yayar). */
  onIconReady(listener: (gameId: string) => void): void {
    this.listeners.push(listener);
  }

  /** Açılışta Steam karşılığı bilinen CURATED oyunların eksik simgelerini tamamla (arka planda, sırayla). */
  onApplicationBootstrap(): void {
    void this.backfillCurated();
  }

  private async backfillCurated(): Promise<void> {
    try {
      const rows = await this.prisma.game.findMany({
        where: {
          source: 'CURATED',
          iconUrl: null,
          externalId: { in: Object.keys(CURATED_STEAM_APP_IDS) },
        },
        select: { id: true, source: true, externalId: true, iconUrl: true },
      });
      for (const row of rows) await this.run(row);
    } catch (err) {
      this.logger.warn(`Oyun simgesi tamamlama atlandı: ${(err as Error).message}`);
    }
  }

  /** Simgesi eksik oyun için arka plan işi başlatır (beklenmez). */
  ensure(game: IconCandidate): void {
    if (game.iconUrl) return;
    void this.run(game);
  }

  steamAppIdFor(game: Pick<IconCandidate, 'source' | 'externalId'>): string | null {
    if (!game.externalId) return null;
    if (game.source === 'STEAM') return game.externalId;
    if (game.source === 'CURATED') return CURATED_STEAM_APP_IDS[game.externalId] ?? null;
    return null;
  }

  private async run(game: IconCandidate): Promise<void> {
    if (this.attempted.has(game.id)) return;
    const appId = this.steamAppIdFor(game);
    if (!appId) return;
    this.attempted.add(game.id);
    try {
      const iconUrl = await this.fetchAndStore(appId);
      if (!iconUrl) return;
      await this.prisma.game.update({ where: { id: game.id }, data: { iconUrl } });
      for (const listener of this.listeners) listener(game.id);
    } catch (err) {
      this.logger.warn(`Oyun simgesi alınamadı (${game.id}): ${(err as Error).message}`);
    }
  }

  /** Steam simgesini indirip 64x64 WebP olarak public depoya yazar; başarısızlıkta null. */
  async fetchAndStore(appId: string): Promise<string | null> {
    const hash = await this.fetchIconHash(appId);
    if (!hash) return null;
    const raw = await this.downloadIcon(appId, hash);
    if (!raw) return null;
    const webp = await sharp(raw, { limitInputPixels: 1024 * 1024 })
      .resize(ICON_SIZE, ICON_SIZE, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
    const key = `${ICON_PREFIX}/${randomUUID()}.webp`;
    await this.storage.putPublic(key, webp, 'image/webp');
    return `${this.config.get<string>('s3.publicBaseUrl')!}/${key}`;
  }

  private async fetchIconHash(appId: string): Promise<string | null> {
    const input = JSON.stringify({
      ids: [{ appid: Number(appId) }],
      context: { language: 'english', country_code: 'US' },
      data_request: { include_assets: true },
    });
    const res = await fetch(`${STEAM_ITEMS_URL}?input_json=${encodeURIComponent(input)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      response?: { store_items?: Array<{ assets?: { community_icon?: unknown } }> };
    };
    const hash = body.response?.store_items?.[0]?.assets?.community_icon;
    return typeof hash === 'string' && ICON_HASH.test(hash) ? hash : null;
  }

  private async downloadIcon(appId: string, hash: string): Promise<Buffer | null> {
    const res = await fetch(`${STEAM_ICON_BASE}/${appId}/${hash}.jpg`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_ICON_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= MAX_ICON_BYTES ? buf : null;
  }
}
