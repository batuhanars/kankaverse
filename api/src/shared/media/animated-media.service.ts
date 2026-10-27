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
import sharp from 'sharp';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Guild, User } from '@prisma/client';
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
  STILL_IMAGE_TYPES,
  STILL_MAX_INPUT_BYTES,
  STILL_MAX_INPUT_PIXELS,
  STILL_PROCESS_TIMEOUT_MS,
  STILL_SIZE,
  STILL_WEBP_QUALITY,
  StillImageType,
} from './animated.constants';
import { readPreviousMedia, writeMedia } from './animated-targets';
import { CropFractions, fitCropToAspect, isValidCrop, PixelRect } from './crop-math';
import { buildAnimatedArgs, buildProbeArgs, buildStaticArgs, ClipRange } from './ffmpeg-args';
import { runBinary } from './run-binary';

const QUALITY_NORMAL = 75;
const QUALITY_LOW = 40;
/** Çözülmüş kare boyutu tavanı (px): dev çözünürlüklü "decompression bomb" girdiyi reddet. */
const MAX_SOURCE_DIMENSION = 4096;

interface ProbeResult {
  durationMs: number | null;
  /** Görüntülenen (döndürme uygulanmış) kare boyutu: kırpma kesirleri buna göre pikselleşir. */
  width: number;
  height: number;
}

type InputType = AnimatedInputType | StillImageType;

interface ProcessInput {
  stagingKey: string;
  startMs?: number;
  durationMs?: number;
  crop?: CropFractions;
}

/** Hedefin en/boy oranı (genişlik / yükseklik): avatar 1, afiş 2.5. */
const TARGET_ASPECT: Record<AnimatedTarget, number> = {
  AVATAR: STILL_SIZE.AVATAR.width / STILL_SIZE.AVATAR.height,
  BANNER: STILL_SIZE.BANNER.width / STILL_SIZE.BANNER.height,
  GUILD_ICON: STILL_SIZE.GUILD_ICON.width / STILL_SIZE.GUILD_ICON.height,
  GUILD_BANNER: STILL_SIZE.GUILD_BANNER.width / STILL_SIZE.GUILD_BANNER.height,
};

/** sharp: libvips önbelleği kapalı (dosya tutmaz). Biçim allowlist'i renderStill'de metadata ile zorlanır. */
sharp.cache(false);
const STILL_SHARP_FORMATS = ['jpeg', 'png', 'webp'];

/**
 * C13 — hareketli avatar / profil-afişi: GIF veya video kesiti → sunucuda hareketli WebP (+ statik kare).
 * C13b — statik görsel (PNG/JPEG/WebP) de bu hatta girer (sharp, yalnız statik WebP) ve her kaynakta
 * kullanıcı kırpması (`crop`) uygulanır.
 * R7: güvenilmeyen dosya sunucuda ffmpeg/sharp'a girer. ffmpeg kuralları `ffmpeg-args.ts` + `run-binary.ts`'te,
 * kırpma matematiği `crop-math.ts`'te.
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
  /** `ownerId`: staging yolu kimliği (kullanıcı hedefinde userId, ortamda guildId); `actorId`: kapı için işlemi yapan kullanıcı. */
  async presign(ownerId: string, contentType: string, size: number, actorId: string = ownerId) {
    const isStill = Object.prototype.hasOwnProperty.call(STILL_IMAGE_TYPES, contentType);
    // C13b PM kararı: hareketli bayrağı yalnız GIF/video'yu kapatır; statik görsel yalnız uploadsEnabled'a tabi.
    this.assertEnabled(actorId, !isStill);

    if (!isStill && !Object.prototype.hasOwnProperty.call(ANIMATED_INPUT_TYPES, contentType)) {
      throw new BadRequestException({
        message: 'Bu dosya türü desteklenmiyor. PNG, JPEG, WebP, GIF, MP4, WebM veya MOV kullanın.',
        error: 'UNSUPPORTED_TYPE',
      });
    }
    const type = contentType as InputType;
    this.assertSizeAllowed(type, size);

    const stagingKey = `${ANIMATED_STAGING_PREFIX}/${ownerId}/${randomUUID()}.${this.extOf(type)}`;
    const uploadUrl = await this.storage.presignPut(stagingKey, contentType);
    return { uploadUrl, stagingKey };
  }

  /**
   * İşleme hattı (sözleşme §2.3). Başarıda güncel User satırını döner; staging + geçici dizin
   * HER durumda temizlenir.
   */
  process(ownerId: string, target: 'AVATAR' | 'BANNER', dto: ProcessInput): Promise<User>;
  process(
    ownerId: string,
    target: 'GUILD_ICON' | 'GUILD_BANNER',
    dto: ProcessInput,
    actorId: string,
  ): Promise<Guild>;
  async process(
    ownerId: string,
    target: AnimatedTarget,
    dto: ProcessInput,
    actorId: string = ownerId,
  ): Promise<User | Guild> {
    // 1. Prefix + bayrak (yalnız GIF/video için) + uploadsEnabled + crop biçimi
    this.assertStagingKey(ownerId, dto.stagingKey);
    const contentType = this.contentTypeFromKey(dto.stagingKey);
    const isStill = this.isStill(contentType);
    this.assertEnabled(actorId, !isStill);
    if (dto.crop !== undefined && !isValidCrop(dto.crop)) {
      throw new BadRequestException({
        message: 'Seçilen alan geçersiz. Görseli yeniden konumlandır.',
        error: 'INVALID_CROP',
      });
    }

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
      const inputPath = join(workDir, `in.${this.extOf(contentType)}`);
      await this.storage.downloadToFile(dto.stagingKey, inputPath, this.maxInputBytes(contentType));

      // 3-6. Dönüşüm + public bucket. Statik görsel: sharp, tek dosya. GIF/video: ffmpeg, hareketli + statik çift.
      const prefix = ANIMATED_PREFIX[target];
      const id = randomUUID();
      let animatedKey: string | null = null;
      let staticKey: string;
      if (this.isStill(contentType)) {
        staticKey = `${prefix}/${ownerId}/${id}-still.webp`;
        const out = await this.renderStill(inputPath, target, dto.crop);
        await this.storage.putPublic(staticKey, out, 'image/webp');
      } else {
        staticKey = `${prefix}/${ownerId}/${id}-static.webp`;
        animatedKey = `${prefix}/${ownerId}/${id}.webp`;
        await this.renderAnimated(contentType, target, inputPath, workDir, dto, {
          animatedKey,
          staticKey,
        });
      }

      // 7. DB (statik kare + hareketli adres). Önceki değerler 8. adım için okunur.
      const previous = await readPreviousMedia(this.prisma, target, ownerId);
      const row = await writeMedia(
        this.prisma,
        target,
        ownerId,
        this.publicUrl(staticKey),
        animatedKey ? this.publicUrl(animatedKey) : null,
      );

      // 8. Sahibin KENDİ değiştirmesi: önceki hareketli + statik nesneleri sil.
      await this.deletePrevious(ownerId, prefix, previous.staticUrl, previous.animatedUrl);
      return row;
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

  /**
   * `animated`: hareketli bayrağı da aranır (GIF/video). Statik görselde yalnız uploadsEnabled
   * (C13b PM kararı: bayrak kapalıyken statik görsel konumlandırmayla yüklenebilir).
   */
  private assertEnabled(userId: string, animated: boolean): void {
    if (animated && !this.canCreateAnimated({ id: userId })) {
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
    const exts = [...Object.values(ANIMATED_INPUT_TYPES), ...Object.values(STILL_IMAGE_TYPES)]
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
  private contentTypeFromKey(key: string): InputType {
    const ext = key.split('.').pop();
    const entry = (
      Object.entries({ ...ANIMATED_INPUT_TYPES, ...STILL_IMAGE_TYPES }) as [
        InputType,
        { ext: string },
      ][]
    ).find(([, v]) => v.ext === ext);
    return entry![0]; // assertStagingKey uzantıyı zaten allowlist'e bağladı
  }

  private isStill(type: InputType): type is StillImageType {
    return Object.prototype.hasOwnProperty.call(STILL_IMAGE_TYPES, type);
  }

  private extOf(type: InputType): string {
    return this.isStill(type) ? STILL_IMAGE_TYPES[type].ext : ANIMATED_INPUT_TYPES[type].ext;
  }

  private maxInputBytes(type: InputType): number {
    if (this.isStill(type)) return STILL_MAX_INPUT_BYTES;
    if (type === 'image/gif') return ANIMATED_MAX_GIF_BYTES;
    return (this.config.get<number>('maxUploadMb') ?? 25) * MB;
  }

  private assertSizeAllowed(type: InputType, size: number): void {
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

  // ─── Dönüşüm hatları ──────────────────────────────────────────────────────

  /** GIF/video → hareketli WebP + statik kare (C13), kırpma C13b. Çıktıları public bucket'a yazar. */
  private async renderAnimated(
    contentType: AnimatedInputType,
    target: AnimatedTarget,
    inputPath: string,
    workDir: string,
    dto: { startMs?: number; durationMs?: number; crop?: CropFractions },
    keys: { animatedKey: string; staticKey: string },
  ): Promise<void> {
    // ffprobe + kesit doğrulaması
    const probe = await this.probe(contentType, inputPath);
    const clip = this.resolveClip(contentType, probe, dto.startMs, dto.durationMs);
    // Crop yoksa ffmpeg'in eski merkez kırpması (cropRect yok); varsa hedef oranına oturtulmuş piksel dikdörtgeni
    const cropRect: PixelRect | undefined = dto.crop
      ? fitCropToAspect(dto.crop, probe.width, probe.height, TARGET_ASPECT[target])
      : undefined;

    // Dönüşüm (+ tavan aşılırsa bir kez düşük kalite)
    const base = { contentType, target, clip, inputPath, cropRect };
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

    await this.storage.putPublic(keys.animatedKey, await readFile(animatedPath), 'image/webp');
    await this.storage.putPublic(keys.staticKey, await readFile(staticPath), 'image/webp');
  }

  /**
   * PNG/JPEG/WebP → statik WebP (sözleşme §2.3). Sıra: metadata (biçim allowlist + EXIF yönüne göre
   * boyut) → rotate (EXIF yönünü uygula) → extract (kırp) → resize → webp. Metadata yazılmaz
   * (`withMetadata` çağrılmaz, EXIF/GPS düşer). Zaman aşımında iş arka planda biter ama sonucu atılır.
   */
  private async renderStill(
    inputPath: string,
    target: AnimatedTarget,
    crop?: CropFractions,
  ): Promise<Buffer> {
    const open = () =>
      sharp(inputPath, { limitInputPixels: STILL_MAX_INPUT_PIXELS, failOn: 'error' });
    const work = async (): Promise<Buffer> => {
      const meta = await open().metadata();
      if (
        !meta.format ||
        !STILL_SHARP_FORMATS.includes(meta.format) ||
        !meta.width ||
        !meta.height
      ) {
        throw new Error(`görsel biçimi geçersiz: ${meta.format}`);
      }
      // Kırpma kesirleri EXIF yönü UYGULANMIŞ boyuta göredir (istemci döndürülmüş görseli gösterir): 5-8 icin en/boy takası
      const swap = (meta.orientation ?? 1) >= 5;
      const rect = fitCropToAspect(
        crop,
        swap ? meta.height : meta.width,
        swap ? meta.width : meta.height,
        TARGET_ASPECT[target],
      );
      const { width, height } = STILL_SIZE[target];
      return open()
        .rotate()
        .extract(rect)
        .resize(width, height)
        .webp({ quality: STILL_WEBP_QUALITY })
        .toBuffer();
    };

    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('sharp zaman aşımı')), STILL_PROCESS_TIMEOUT_MS);
      });
      const out = await Promise.race([work(), timeout]);
      if (out.length === 0) throw new Error('boş çıktı');
      return out;
    } catch (e) {
      this.logger.warn(`sharp reddetti: ${(e as Error).message}`);
      throw this.invalidMedia();
    } finally {
      clearTimeout(timer);
    }
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
        streams?: {
          codec_type?: string;
          width?: number;
          height?: number;
          side_data_list?: { rotation?: number }[];
          tags?: { rotate?: string };
        }[];
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
      // ffmpeg döndürme üstverisini filtrelerden ÖNCE uygular (autorotate): crop görüntülenen boyuta göre.
      const rotation = Math.abs(
        Number(
          video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
            video.tags?.rotate ??
            0,
        ),
      );
      const swap = rotation % 180 === 90;
      return {
        durationMs: Number.isFinite(seconds) ? Math.floor(seconds * 1000) : null,
        width: swap ? video.height : video.width,
        height: swap ? video.width : video.height,
      };
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
    // Silinebilir: bu hattın ürettiği hareketli çift VEYA statik-görsel çıktısı (`-still.webp`).
    // C8 statik yüklemesine (uuid.png|jpg|webp) dokunulmaz.
    const prevIsStill = !!prevStaticUrl && /-still\.webp$/.test(prevStaticUrl);
    if (!prevAnimatedUrl && !prevIsStill) return;
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
