import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { StorageService } from '../../shared/storage/storage.service';
import { runBinary } from '../../shared/media/run-binary';
import {
  AI_INPUT_DURATION_TOLERANCE_S,
  AI_INPUT_KINDS,
  AiInputKind,
  AiVideoError,
  inputTypeOfKey,
} from './ai-video.constants';
import { AI_VIDEO_MESSAGES } from './ai-video.mapper';
import { AiVideoReferenceSpec } from './ai-video.models';
import { AiVideoInputService } from './ai-video-input.service';

export interface AiVideoReference {
  kind: AiInputKind;
  key: string;
}

/** Satırdaki `references` Json?'ı yazılı diziye çevirir (null/bozuk = referans yok). */
export function parseReferences(json: unknown): AiVideoReference[] {
  if (!Array.isArray(json)) return [];
  return (json as { kind?: unknown; key?: unknown }[]).filter(
    (r): r is AiVideoReference =>
      typeof r?.key === 'string' && (AI_INPUT_KINDS as unknown[]).includes(r.kind),
  );
}

const PROBE_TIMEOUT_MS = 15_000;
/** Süre okuma için indirme tavanı: en büyük girdi (video) kadar. */
const PROBE_MAX_BYTES = 50 * 1024 * 1024;

const invalid = (error: string) =>
  new BadRequestException({ message: AI_VIDEO_MESSAGES[error], error });

/**
 * C42 §1.3 — çoklu referans doğrulaması: tür başına sayı tavanı, tür ↔ uzantı uyumu, anahtar sahipliği/boyut
 * (assertInputKey) ve video/ses süreleri (ffprobe, sunucuda; istemci denetimi yalnız erken uyarı).
 */
@Injectable()
export class AiVideoReferenceService {
  private readonly ffprobePath: string;

  constructor(
    private storage: StorageService,
    private input: AiVideoInputService,
    config: ConfigService,
  ) {
    this.ffprobePath = config.get<string>('ffprobePath') ?? 'ffprobe';
  }

  async validate(
    userId: string,
    spec: AiVideoReferenceSpec,
    refs: AiVideoReference[],
  ): Promise<void> {
    if (refs.length === 0) throw invalid(AiVideoError.INVALID_OPTION);
    for (const kind of AI_INPUT_KINDS) {
      if (refs.filter((r) => r.kind === kind).length > spec.max[kind]) {
        throw invalid(AiVideoError.INVALID_OPTION);
      }
    }
    for (const ref of refs) {
      await this.input.assertInputKey(userId, ref.key);
      if (inputTypeOfKey(ref.key)![1].kind !== ref.kind) {
        throw invalid(AiVideoError.INVALID_OPTION);
      }
    }
    await this.assertDurations(spec, refs);
  }

  private async assertDurations(spec: AiVideoReferenceSpec, refs: AiVideoReference[]) {
    const videos = await this.durationsOf(refs.filter((r) => r.kind === 'video'));
    const audios = await this.durationsOf(refs.filter((r) => r.kind === 'audio'));
    const tol = AI_INPUT_DURATION_TOLERANCE_S;
    const tooLong =
      videos.some((s) => s > spec.videoMaxS + tol) ||
      videos.reduce((sum, s) => sum + s, 0) > spec.videoTotalMaxS + tol ||
      audios.some((s) => s > spec.audioMaxS + tol);
    if (tooLong) throw invalid(AiVideoError.INPUT_TOO_LONG);
  }

  private durationsOf(refs: AiVideoReference[]): Promise<number[]> {
    return Promise.all(refs.map((r) => this.probeDurationS(r.key)));
  }

  /** Nesneyi geçici dosyaya indirir, ffprobe ile süre (sn) okur. Okunamayan dosya → 400 INVALID_STORAGE_KEY. */
  private async probeDurationS(key: string): Promise<number> {
    const demuxer = inputTypeOfKey(key)![1].demuxer!;
    let dir: string | undefined;
    try {
      dir = await mkdtemp(join(tmpdir(), 'kv-aiin-'));
      const file = join(dir, 'in');
      await this.storage.downloadToFile(key, file, PROBE_MAX_BYTES);
      const out = await runBinary(
        this.ffprobePath,
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file',
          '-f',
          demuxer,
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          file,
        ],
        PROBE_TIMEOUT_MS,
      );
      const seconds = Number.parseFloat(out.trim());
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Süre okunamadı');
      return seconds;
    } catch {
      throw new BadRequestException({
        message: 'Dosya okunamadı. Yeniden yükle.',
        error: 'INVALID_STORAGE_KEY',
      });
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
