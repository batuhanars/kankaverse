import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AutomodService } from '../automod/automod.service';
import { GameIconService } from './game-icon.service';

export interface ResolvedGame {
  id: string;
  name: string;
  /** C31c: sunucunun kendi depoladığı 64x64 simge; yoksa null. */
  iconUrl: string | null;
}

export interface CuratedGame {
  id: string;
  name: string;
  executables: string[];
}

/** Kullanıcı başına günde en çok bu kadar YENİ (tabloda olmayan) Steam/Epic kaydı açılır (§1.7). */
export const GAMES_DAILY_NEW_LIMIT = 20;
const CURATED_CACHE_MS = 60 * 60 * 1000;
const STEAM_FETCH_TIMEOUT_MS = 5000;
const EPIC_NAME_MAX = 64;
// Epic adı kullanıcının düzenleyebildiği bir dosyadan gelir: kontrol karakteri ve yön değiştirici
// (bidi) işaretleri görünen ada sızmasın diye reddedilir.
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/;
const STEAM_APPID = /^\d{1,10}$/;
const EPIC_CATALOG_ID = /^[A-Za-z0-9]{8,64}$/;

/**
 * C31b §1 — oyun tablosu ve üç kaynak (Steam + Epic + elle liste).
 *
 * Çekirdek ilke: görünen oyun adı HİÇBİR ZAMAN istemciden olduğu gibi alınmaz.
 *  - CURATED: ad migration tohumundan gelir, istemci yalnız tablo kimliğini söyler.
 *  - STEAM: ad sunucunun Steam mağazasından çektiği addır; çekilemezse kayıt açılmaz.
 *  - EPIC: ad manifestten gelir ve doğrulanamaz; yalnız İLK kayıtta, automod süzgecinden geçerse
 *    tabloya yazılır ve kilitlenir (sonraki farklı ad yok sayılır).
 */
@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);
  private curatedCache: { at: number; list: CuratedGame[] } | null = null;
  /** Aynı appid için eşzamanlı istekler tek mağaza çekimine düşer. */
  private readonly steamInflight = new Map<string, Promise<string | null>>();
  /** userId → gün (UTC) ve o gün açtığı yeni kayıt sayısı. Bellek-içi (tek instance, presence ile aynı ilke). */
  private readonly newRecordCounts = new Map<string, { day: string; count: number }>();

  constructor(
    private prisma: PrismaService,
    private automod: AutomodService,
    private icons: GameIconService,
  ) {}

  /** C31c: simge arka planda yazılınca haber ver (presence yeniden yayar). */
  onIconReady(listener: (gameId: string) => void): void {
    this.icons.onIconReady(listener);
  }

  /** GET /games/curated — yalnız CURATED, masaüstü eşleme için. 1 saat önbellek. */
  async listCurated(): Promise<CuratedGame[]> {
    const now = Date.now();
    if (this.curatedCache && now - this.curatedCache.at < CURATED_CACHE_MS) {
      return this.curatedCache.list;
    }
    const rows = await this.prisma.game.findMany({
      where: { source: 'CURATED', hidden: false },
      select: { id: true, name: true, executables: true },
      orderBy: { name: 'asc' },
    });
    const list = rows.map(({ id, name, executables }) => ({ id, name, executables }));
    this.curatedCache = { at: now, list };
    return list;
  }

  /**
   * `ref` → tablodaki oyun ya da null (gateway doğrulaması). Biçimler:
   * `curated:<id>` · `steam:<appid>` · `epic:<catalogItemId>`.
   * Bilinmeyen biçim, `hidden` oyun, çekilemeyen Steam adı, süzgece takılan Epic adı ve günlük sınır → null.
   */
  async resolve(
    ref: unknown,
    opts: { userId: string; epicName?: unknown },
  ): Promise<ResolvedGame | null> {
    if (typeof ref !== 'string') return null;
    const sep = ref.indexOf(':');
    if (sep < 1) return null;
    const kind = ref.slice(0, sep);
    const value = ref.slice(sep + 1);

    if (kind === 'curated') return this.resolveCurated(value);
    if (kind === 'steam') {
      return STEAM_APPID.test(value) ? this.resolveSteam(value, opts.userId) : null;
    }
    if (kind === 'epic') {
      return EPIC_CATALOG_ID.test(value)
        ? this.resolveEpic(value, opts.epicName, opts.userId)
        : null;
    }
    return null;
  }

  /** Kimlikten ad (yayın için). Gizli oyun null döner. */
  async visibleById(id: string): Promise<ResolvedGame | null> {
    const game = await this.prisma.game.findUnique({
      where: { id },
      select: { id: true, name: true, hidden: true, iconUrl: true },
    });
    if (!game || game.hidden) return null;
    return { id: game.id, name: game.name, iconUrl: game.iconUrl };
  }

  // ── Kaynaklar ───────────────────────────────────────────────────────────────

  private async resolveCurated(id: string): Promise<ResolvedGame | null> {
    const game = await this.prisma.game.findFirst({
      where: { id, source: 'CURATED', hidden: false },
      select: { id: true, name: true, iconUrl: true, externalId: true },
    });
    if (!game) return null;
    this.icons.ensure({ ...game, source: 'CURATED' });
    return { id: game.id, name: game.name, iconUrl: game.iconUrl };
  }

  private async resolveSteam(appId: string, userId: string): Promise<ResolvedGame | null> {
    const existing = await this.findExternal('STEAM', appId);
    if (existing) {
      if (existing.hidden) return null;
      this.icons.ensure({ ...existing, source: 'STEAM', externalId: appId });
      return { id: existing.id, name: existing.name, iconUrl: existing.iconUrl };
    }
    if (!this.takeNewRecordSlot(userId)) return null;

    let pending = this.steamInflight.get(appId);
    if (!pending) {
      pending = this.fetchSteamName(appId).finally(() => this.steamInflight.delete(appId));
      this.steamInflight.set(appId, pending);
    }
    const name = await pending;
    if (!name) return null;
    const created = await this.createExternal('STEAM', appId, name);
    if (created) this.icons.ensure({ ...created, source: 'STEAM', externalId: appId });
    return created;
  }

  private async resolveEpic(
    catalogId: string,
    epicName: unknown,
    userId: string,
  ): Promise<ResolvedGame | null> {
    // Tabloda varsa TABLODAKİ ad kullanılır: ilk gelen kilitlenir, sonraki farklı ad yok sayılır.
    const existing = await this.findExternal('EPIC', catalogId);
    if (existing) {
      return existing.hidden
        ? null
        : { id: existing.id, name: existing.name, iconUrl: existing.iconUrl };
    }

    if (typeof epicName !== 'string') return null;
    const name = epicName.trim();
    if (name.length < 1 || name.length > EPIC_NAME_MAX || UNSAFE_NAME_CHARS.test(name)) return null;
    // Mevcut automod süzgeci (mesaj süzgeciyle aynı kelime listesi); ayrı bir ad süzgeci yok.
    if (this.automod.check(name).blocked) return null;
    if (!this.takeNewRecordSlot(userId)) return null;
    return this.createExternal('EPIC', catalogId, name);
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────────────

  private findExternal(source: 'STEAM' | 'EPIC', externalId: string) {
    return this.prisma.game.findUnique({
      where: { source_externalId: { source, externalId } },
      select: { id: true, name: true, hidden: true, iconUrl: true },
    });
  }

  private async createExternal(
    source: 'STEAM' | 'EPIC',
    externalId: string,
    name: string,
  ): Promise<ResolvedGame | null> {
    try {
      return await this.prisma.game.create({
        data: { source, externalId, name },
        select: { id: true, name: true, iconUrl: true },
      });
    } catch (err) {
      // Eşzamanlı iki istek aynı oyunu açtı: kazananın kaydı geçerli (ilk gelen kilitlenir).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.findExternal(source, externalId);
        return winner && !winner.hidden
          ? { id: winner.id, name: winner.name, iconUrl: winner.iconUrl }
          : null;
      }
      throw err;
    }
  }

  private async fetchSteamName(appId: string): Promise<string | null> {
    try {
      const res = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&l=turkish`,
        { signal: AbortSignal.timeout(STEAM_FETCH_TIMEOUT_MS) },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as Record<
        string,
        { success?: boolean; data?: { name?: unknown; type?: unknown } }
      >;
      const entry = body?.[appId];
      if (!entry?.success || entry.data?.type !== 'game') return null;
      const name = typeof entry.data.name === 'string' ? entry.data.name.trim() : '';
      return name.length > 0 && name.length <= 128 ? name : null;
    } catch (err) {
      this.logger.warn(`Steam adı çekilemedi (appid ${appId}): ${(err as Error).message}`);
      return null;
    }
  }

  /** Günlük yeni kayıt hakkı (§1.7). Hak varsa bir tane harcar. */
  private takeNewRecordSlot(userId: string): boolean {
    const day = new Date().toISOString().slice(0, 10);
    const entry = this.newRecordCounts.get(userId);
    if (!entry || entry.day !== day) {
      this.newRecordCounts.set(userId, { day, count: 1 });
      return true;
    }
    if (entry.count >= GAMES_DAILY_NEW_LIMIT) return false;
    entry.count += 1;
    return true;
  }
}
