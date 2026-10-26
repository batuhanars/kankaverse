import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  ANIMATED_INPUT_TYPES,
  ANIMATED_MAX_CLIP_MS,
  ANIMATED_MAX_CONCURRENCY,
  ANIMATED_MAX_GIF_BYTES,
  ANIMATED_MAX_OUTPUT_BYTES,
  ANIMATED_MIN_CLIP_MS,
  ANIMATED_PREFIX,
  ANIMATED_PROCESS_TIMEOUT_MS,
  ANIMATED_STAGING_PREFIX,
  AnimatedInputType,
  AnimatedTarget,
  MB,
} from './animated.constants';
import { buildAnimatedArgs, buildProbeArgs, buildStaticArgs, ClipRange } from './ffmpeg-args';
import { runBinary } from './run-binary';

const QUALITY_NORMAL = 75;
const QUALITY_LOW = 40;
/** Çözülmüş kare boyutu tavanı (px): dev çözünürlüklü "decompression bomb" girdiyi reddet. */
const MAX_SOURCE_DIMENSION = 4096;

interface ProbeResult {
  durationMs: number | null;
}

/**
 * C13 — hareketli avatar / profil-afişi: GIF veya video kesiti → sunucuda hareketli WebP (+ statik kare).
 * R7: güvenilmeyen dosya sunucuda ffmpeg'e girer. Güvenlik kuralları `ffmpeg-args.ts` + `run-binary.ts`'te.
 */
@Injectable()
export class AnimatedMediaService {
  private readonly logger = new Logger(AnimatedMediaService.name);
  private active = 0;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  /**
   * Abonelik kapısının TEK noktası (sözleşme §2.4). Bugün yalnız bayrak; abonelik sprinti yalnız
   * bu fonksiyonu değiştirir. Entitlement/plan kodu ŞİMDİ yazılmaz.
   */
  canCreateAnimated(user: { id: string }): boolean {
    void user; // bugün kullanıcıya bakılmıyor; abonelik gelince imza değişmeden burası dolacak
    return this.config.get<boolean>('animatedProfileEnabled') === true;
  }

  /** POST /users/me/animated/presign — ÖZEL bucket'a staging anahtarı için presigned PUT. */
  async presign(userId: string, contentType: string, size: number) {
    this.assertEnabled(userId);

    if (!Object.prototype.hasOwnProperty.call(ANIMATED_INPUT_TYPES, contentType)) {
      throw new BadRequestException({
        message: 'Bu dosya türü desteklenmiyor. GIF, MP4, WebM veya MOV kullanın.',
        error: 'UNSUPPORTED_TYPE',
      });
    }
    const type = contentType as AnimatedInputType;
    this.assertSizeAllowed(type, size);

    const stagingKey = `${ANIMATED_STAGING_PREFIX}/${userId}/${randomUUID()}.${ANIMATED_INPUT_TYPES[type].ext}`;
    const uploadUrl = await this.storage.presignPut(stagingKey, contentType);
    return { uploadUrl, stagingKey };
  }

  /**
   * İşleme hattı (sözleşme §2.3). Başarıda güncel User satırını döner; staging + geçici dizin
   * HER durumda temizlenir.
   */
  async process(
    userId: string,
    target: AnimatedTarget,
    dto: { stagingKey: string; startMs?: number; durationMs?: number },
  ) {
    // 1. Bayrak + uploadsEnabled + prefix
    this.assertEnabled(userId);
    this.assertStagingKey(userId, dto.stagingKey);
    const contentType = this.contentTypeFromKey(dto.stagingKey);

    // Eşzamanlılık: dolu ise beklemeden ret. Sayaç, aşağıdaki finally'de düşer.
    if (this.active >= ANIMATED_MAX_CONCURRENCY) {
      throw new ServiceUnavailableException({
        message: 'Şu an çok fazla dönüşüm var, biraz sonra tekrar dene.',
        error: 'PROCESSING_BUSY',
      });
    }
    this.active++;

    let workDir: string | null = null;
    try {
      // 2. Gerçek boyut (HEAD) + indirme
      const size = await this.headOrInvalid(dto.stagingKey);
      this.assertSizeAllowed(contentType, size);
      workDir = await mkdtemp(join(tmpdir(), 'kv-animated-'));
      const inputPath = join(workDir, `in.${ANIMATED_INPUT_TYPES[contentType].ext}`);
      await this.storage.downloadToFile(dto.stagingKey, inputPath, this.maxInputBytes(contentType));

      // 3. ffprobe + kesit doğrulaması
      const probe = await this.probe(contentType, inputPath);
      const clip = this.resolveClip(contentType, probe, dto.startMs, dto.durationMs);

      // 4-5. Dönüşüm (+ tavan aşılırsa bir kez düşük kalite)
      const base = { contentType, target, clip, inputPath };
      const animatedPath = join(workDir, 'out.webp');
      const staticPath = join(workDir, 'out-static.webp');
      const limit = ANIMATED_MAX_OUTPUT_BYTES[target];

      await this.convert(
        buildAnimatedArgs({ ...base, outputPath: animatedPath, quality: QUALITY_NORMAL }),
      );
      if ((await this.sizeOf(animatedPath)) > limit) {
        await this.convert(
          buildAnimatedArgs({ ...base, outputPath: animatedPath, quality: QUALITY_LOW }),
        );
        if ((await this.sizeOf(animatedPath)) > limit) {
          throw new UnprocessableEntityException({
            message: 'Görsel işlendikten sonra bile çok büyük. Daha kısa veya sade bir kesit dene.',
            error: 'MEDIA_TOO_LARGE_AFTER_PROCESS',
          });
        }
      }
      await this.convert(
        buildStaticArgs({ ...base, outputPath: staticPath, quality: QUALITY_NORMAL }),
      );
      await this.sizeOf(staticPath);

      // 6. Public bucket'a iki dosya
      const prefix = ANIMATED_PREFIX[target];
      const id = randomUUID();
      const animatedKey = `${prefix}/${userId}/${id}.webp`;
      const staticKey = `${prefix}/${userId}/${id}-static.webp`;
      await this.storage.putPublic(animatedKey, await readFile(animatedPath), 'image/webp');
      await this.storage.putPublic(staticKey, await readFile(staticPath), 'image/webp');

      // 7. DB (statik kare + hareketli adres). Önceki değerler 8. adım için okunur.
      const previous = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          avatarUrl: true,
          avatarAnimatedUrl: true,
          bannerUrl: true,
          bannerAnimatedUrl: true,
        },
      });
      const user = await this.prisma.user.update({
        where: { id: userId },
        data:
          target === 'AVATAR'
            ? {
                avatarUrl: this.publicUrl(staticKey),
                avatarAnimatedUrl: this.publicUrl(animatedKey),
              }
            : {
                bannerUrl: this.publicUrl(staticKey),
                bannerAnimatedUrl: this.publicUrl(animatedKey),
              },
      });

      // 8. Kullanıcının KENDİ değiştirmesi: önceki hareketli + statik nesneleri sil.
      if (target === 'AVATAR') {
        await this.deletePrevious(userId, prefix, previous?.avatarUrl, previous?.avatarAnimatedUrl);
      } else {
        await this.deletePrevious(userId, prefix, previous?.bannerUrl, previous?.bannerAnimatedUrl);
      }
      return user;
    } finally {
      this.active--;
      // 9. Staging + geçici dizin her durumda
      await this.storage
        .delete(dto.stagingKey)
        .catch((e: Error) =>
          this.logger.warn(`staging silinemedi: ${dto.stagingKey} (${e?.message})`),
        );
      if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  // ─── Doğrulamalar ─────────────────────────────────────────────────────────

  private assertEnabled(userId: string): void {
    if (!this.canCreateAnimated({ id: userId })) {
      throw new ForbiddenException({
        message: 'Hareketli profil görseli şu an kapalı.',
        error: 'ANIMATED_DISABLED',
      });
    }
    if (!this.config.get<boolean>('uploadsEnabled')) {
      throw new ForbiddenException({
        message: 'Dosya yükleme şu an kapalı.',
        error: 'UPLOADS_DISABLED',
      });
    }
  }

  private assertStagingKey(userId: string, key: string): void {
    // Yol atlatma (../) ve beklenmeyen biçim: prefix + userId + uuid + izinli uzantı dışında hiçbir
    // şey kabul edilmez. userId cuid/uuid (regex özel karakteri içermez) ama yine de kaçırılır.
    const exts = Object.values(ANIMATED_INPUT_TYPES)
      .map((t) => t.ext)
      .join('|');
    const safeUserId = userId.replace(/[^A-Za-z0-9-]/g, '\\$&');
    const re = new RegExp(
      `^${ANIMATED_STAGING_PREFIX}/${safeUserId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${exts})$`,
    );
    if (!re.test(key)) {
      throw new BadRequestException({
        message: 'Geçersiz storage anahtarı.',
        error: 'INVALID_STORAGE_KEY',
      });
    }
  }

  /** Girdi biçimi anahtarın uzantısından (presign'da contentType'tan üretilmişti) → zorlanan demuxer. */
  private contentTypeFromKey(key: string): AnimatedInputType {
    const ext = key.split('.').pop();
    const entry = (
      Object.entries(ANIMATED_INPUT_TYPES) as [AnimatedInputType, { ext: string }][]
    ).find(([, v]) => v.ext === ext);
    return entry![0]; // assertStagingKey uzantıyı zaten allowlist'e bağladı
  }

  private maxInputBytes(type: AnimatedInputType): number {
    if (type === 'image/gif') return ANIMATED_MAX_GIF_BYTES;
    return (this.config.get<number>('maxUploadMb') ?? 25) * MB;
  }

  private assertSizeAllowed(type: AnimatedInputType, size: number): void {
    if (!Number.isFinite(size) || size <= 0 || size > this.maxInputBytes(type)) {
      throw new BadRequestException({
        message: `Dosya boyutu ${Math.round(this.maxInputBytes(type) / MB)} MB sınırını aşıyor.`,
        error: 'FILE_TOO_LARGE',
      });
    }
  }

  private async headOrInvalid(key: string): Promise<number> {
    try {
      return await this.storage.headSize(key);
    } catch {
      throw new BadRequestException({
        message: 'Yüklenen dosya bulunamadı. Yüklemeyi tekrar dene.',
        error: 'INVALID_STORAGE_KEY',
      });
    }
  }

  /** startMs/durationMs doğrulaması (GIF'te yok sayılır: ilk 6 sn). */
  private resolveClip(
    type: AnimatedInputType,
    probe: ProbeResult,
    startMs?: number,
    durationMs?: number,
  ): ClipRange {
    if (type === 'image/gif') return { startMs: 0, durationMs: ANIMATED_MAX_CLIP_MS };

    const start = startMs ?? 0;
    // PM netleştirmesi (§2.2): süre verilmezse min(6000, video süresi). Web, tarayıcının çözemediği
    // videolarda (Chrome'da .mov) aralık göndermez → "ilk 6 saniye". Alt sınır 500 (ffmpeg EOF'ta durur).
    const duration =
      durationMs ??
      Math.max(
        ANIMATED_MIN_CLIP_MS,
        Math.min(
          ANIMATED_MAX_CLIP_MS,
          probe.durationMs !== null ? probe.durationMs - start : Infinity,
        ),
      );
    const bad =
      !Number.isInteger(start) ||
      start < 0 ||
      !Number.isInteger(duration) ||
      duration < ANIMATED_MIN_CLIP_MS ||
      duration > ANIMATED_MAX_CLIP_MS ||
      (probe.durationMs !== null && start >= probe.durationMs);
    if (bad) {
      throw new BadRequestException({
        message: 'Geçersiz kesit aralığı.',
        error: 'INVALID_RANGE',
      });
    }
    return { startMs: start, durationMs: duration };
  }

  // ─── ffmpeg ───────────────────────────────────────────────────────────────

  private async probe(type: AnimatedInputType, inputPath: string): Promise<ProbeResult> {
    try {
      const out = await runBinary(
        this.config.get<string>('ffprobePath') ?? 'ffprobe',
        buildProbeArgs(type, inputPath),
        ANIMATED_PROCESS_TIMEOUT_MS,
      );
      const json = JSON.parse(out) as {
        streams?: { codec_type?: string; width?: number; height?: number }[];
        format?: { duration?: string };
      };
      const video = json.streams?.find((s) => s.codec_type === 'video');
      if (
        !video ||
        !video.width ||
        !video.height ||
        video.width > MAX_SOURCE_DIMENSION ||
        video.height > MAX_SOURCE_DIMENSION
      ) {
        throw new Error('video akışı yok veya boyut geçersiz');
      }
      const seconds = Number(json.format?.duration);
      return { durationMs: Number.isFinite(seconds) ? Math.floor(seconds * 1000) : null };
    } catch (e) {
      this.logger.warn(`ffprobe reddetti: ${(e as Error).message}`);
      throw this.invalidMedia();
    }
  }

  private async convert(args: string[]): Promise<void> {
    try {
      await runBinary(
        this.config.get<string>('ffmpegPath') ?? 'ffmpeg',
        args,
        ANIMATED_PROCESS_TIMEOUT_MS,
      );
    } catch (e) {
      this.logger.warn(`ffmpeg başarısız: ${(e as Error).message}`);
      throw this.invalidMedia();
    }
  }

  private async sizeOf(path: string): Promise<number> {
    try {
      const { size } = await stat(path);
      if (size > 0) return size;
    } catch {
      // çıktı hiç oluşmadı
    }
    throw this.invalidMedia();
  }

  private invalidMedia(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      message: 'Bu dosya işlenemedi. Bozuk olabilir, başka bir dosya dene.',
      error: 'INVALID_MEDIA',
    });
  }

  // ─── Depolama yardımcıları ────────────────────────────────────────────────

  private publicUrl(key: string): string {
    return `${this.config.get<string>('s3.publicBaseUrl')!}/${key}`;
  }

  /**
   * Önceki hareketli + statik nesneleri siler. YALNIZ önceki değer hareketliyse (bu hattın ürettiği
   * çift) ve anahtar `${prefix}/${userId}/` altındaysa; C8 statik yüklemesine dokunulmaz.
   * Hata sessizce loglanır (yeni görsel zaten yayında; orphan D13 temizliğine kalır).
   */
  private async deletePrevious(
    userId: string,
    prefix: string,
    prevStaticUrl?: string | null,
    prevAnimatedUrl?: string | null,
  ): Promise<void> {
    if (!prevAnimatedUrl) return;
    const base = `${this.config.get<string>('s3.publicBaseUrl')!}/`;
    const owned = `${prefix}/${userId}/`;
    for (const url of [prevAnimatedUrl, prevStaticUrl]) {
      if (!url || !url.startsWith(base)) continue;
      const key = url.slice(base.length);
      if (!key.startsWith(owned) || key.includes('..')) continue;
      await this.storage
        .deletePublic(key)
        .catch((e: Error) => this.logger.warn(`eski nesne silinemedi: ${key} (${e?.message})`));
    }
  }
}
