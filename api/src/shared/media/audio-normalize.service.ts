import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  buildDurationProbeArgs,
  buildLoudnormArgs,
  isNormalizableAudio,
} from './audio-normalize-args';
import { runBinary } from './run-binary';

const NORMALIZE_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 15_000;
/** Sesli mesaj sınırı 5 dk; yüklenen ses dosyası için de makul tavan (indirme emniyeti). */
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const OUTPUT_SIZE_FACTOR = 3;
/** Güvenlik kapısı: çıktı süresi girdiden en fazla bu kadar sapabilir. */
const MAX_DURATION_DRIFT_MS = 500;

export type NormalizeOutcome = 'processed' | 'skipped' | 'failed';

/**
 * C32 — sesli mesaj ses seviyesi eşitleme (loudnorm -16 LUFS). Dosyanın kendisi sunucuda yeniden yazılır,
 * böylece her istemci aynı (eşit) dosyayı çalar. Hata asla fırlatılmaz: orijinal dosya kalır.
 * Kuyruk süreç içi, eşzamanlılık 1 (VPS CPU'su).
 */
@Injectable()
export class AudioNormalizeService {
  private readonly logger = new Logger(AudioNormalizeService.name);
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  /** Sıraya ekler ve hemen döner (çağıran beklemez). normalize() fırlatmadığı için zincir kopmaz. */
  enqueue(attachmentId: string): void {
    this.chain = this.chain.then(() => this.normalize(attachmentId));
  }

  /** Mesajdaki ses eklerini sıraya alır (yalnız normalize edilebilir türler). */
  enqueueFromMessage(message: { attachments?: { id: string; contentType: string }[] }): void {
    for (const a of message.attachments ?? []) {
      if (isNormalizableAudio(a.contentType)) this.enqueue(a.id);
    }
  }

  /** Tek ek: koşullar sağlanmazsa 'skipped', hata/güvenlik kapısı 'failed' (orijinal kalır). Asla fırlatmaz. */
  async normalize(attachmentId: string): Promise<NormalizeOutcome> {
    let dir: string | null = null;
    try {
      const att = await this.prisma.attachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          storageKey: true,
          contentType: true,
          scanStatus: true,
          messageId: true,
          audioNormalizedAt: true,
          message: { select: { deletedAt: true } },
        },
      });
      if (
        !att ||
        !isNormalizableAudio(att.contentType) ||
        att.scanStatus !== 'CLEAN' ||
        !att.messageId ||
        !att.message ||
        att.message.deletedAt !== null ||
        att.audioNormalizedAt !== null
      ) {
        return 'skipped';
      }

      dir = await mkdtemp(join(tmpdir(), 'kv-loud-'));
      const input = join(dir, 'in');
      const output = join(dir, 'out');
      const ffmpeg = this.config.get<string>('ffmpegPath') ?? 'ffmpeg';
      const ffprobe = this.config.get<string>('ffprobePath') ?? 'ffprobe';

      await this.storage.downloadToFile(att.storageKey, input, MAX_INPUT_BYTES);
      const inputBytes = (await stat(input)).size;
      const inMs = await this.probeDurationMs(ffprobe, att.contentType, input);

      await runBinary(
        ffmpeg,
        buildLoudnormArgs(att.contentType, input, output),
        NORMALIZE_TIMEOUT_MS,
      );

      const outBytes = (await stat(output)).size;
      if (outBytes === 0 || outBytes > inputBytes * OUTPUT_SIZE_FACTOR) {
        this.logger.warn(`Ses eşitleme reddedildi (boyut ${outBytes}/${inputBytes}): ${att.id}`);
        return 'failed';
      }
      const outMs = await this.probeDurationMs(ffprobe, att.contentType, output);
      if (Math.abs(outMs - inMs) > MAX_DURATION_DRIFT_MS) {
        this.logger.warn(`Ses eşitleme reddedildi (süre ${inMs} -> ${outMs} ms): ${att.id}`);
        return 'failed';
      }

      // Aynı depolama anahtarı + aynı contentType. durationMs/waveform değişmez.
      await this.storage.putPrivate(att.storageKey, await readFile(output), att.contentType);
      await this.prisma.attachment.update({
        where: { id: att.id },
        data: { size: outBytes, audioNormalizedAt: new Date() },
      });
      return 'processed';
    } catch (err) {
      this.logger.error(`Ses eşitleme hatası (ek ${attachmentId})`, err);
      return 'failed';
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async probeDurationMs(
    ffprobe: string,
    contentType: string,
    path: string,
  ): Promise<number> {
    const out = await runBinary(
      ffprobe,
      buildDurationProbeArgs(contentType, path),
      PROBE_TIMEOUT_MS,
    );
    const seconds = Number.parseFloat(out.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Süre okunamadı');
    return Math.round(seconds * 1000);
  }
}
