import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiVideoStatus, ScanStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import { buildStorageKey } from '../attachments/attachments.service';
import { extractVideoPoster, VideoPoster } from '../../shared/media/video-poster';
import { AI_OUTPUT_MAX_BYTES, AiVideoError } from './ai-video.constants';
import { AI_VIDEO_MESSAGES } from './ai-video.mapper';

const ATTACHMENT_FILENAME = 'kankaverse-yz.mp4';

/**
 * C14b §2.4 [R7] — tamamlanmış üretimi mesaja iliştirilebilir bekleyen `Attachment`'a çevirir.
 * Mesaj GÖNDERMEZ ve izin denetimi YAPMAZ: istemci dönen `attachmentId` ile mevcut mesaj gönderme yolunu
 * çağırır (kanal yetkisi, canDm, blok, hız sınırı orada). Rozet `aiGenerationId`'den sunucuda türer.
 */
@Injectable()
export class AiVideoAttachmentService {
  private readonly logger = new Logger(AiVideoAttachmentService.name);
  private readonly scanEnabled: boolean;
  private readonly uploadsEnabled: boolean;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    config: ConfigService,
  ) {
    this.scanEnabled = config.get<boolean>('attachmentScanEnabled') ?? false;
    this.uploadsEnabled = config.get<boolean>('uploadsEnabled') ?? false;
    this.ffmpegPath = config.get<string>('ffmpegPath') ?? 'ffmpeg';
    this.ffprobePath = config.get<string>('ffprobePath') ?? 'ffprobe';
  }

  async createFromGeneration(userId: string, generationId: string) {
    // UPLOADS_ENABLED acil kapatma anahtarı: yapay zeka yolu yükleme presign'ını baypas etmez (aynı hata).
    if (!this.uploadsEnabled) {
      throw new ForbiddenException({
        message: 'Dosya yükleme şu an kapalı.',
        error: 'UPLOADS_DISABLED',
      });
    }
    const row = await this.prisma.aiVideoGeneration.findFirst({
      where: { id: generationId, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Üretim bulunamadı.');
    if (row.status !== AiVideoStatus.COMPLETED || !row.outputKey) {
      throw new ConflictException({
        message: AI_VIDEO_MESSAGES[AiVideoError.NOT_READY],
        error: AiVideoError.NOT_READY,
      });
    }

    const size = await this.storage.headSize(row.outputKey);
    const poster = await this.posterOf(row.outputKey);
    const storageKey = buildStorageKey(ATTACHMENT_FILENAME);
    await this.storage.copy(row.outputKey, storageKey);

    const attachment = await this.prisma.attachment.create({
      data: {
        uploaderId: userId,
        messageId: null,
        storageKey,
        filename: ATTACHMENT_FILENAME,
        contentType: 'video/mp4',
        size,
        durationMs: row.durationS * 1000,
        thumbnail: poster?.thumbnail ?? null,
        width: poster?.width ?? null,
        height: poster?.height ?? null,
        aiGenerationId: row.id,
        // Yükleme hattıyla aynı kural (messages.service attach); mesaja bağlanırken orada yeniden uygulanır
        scanStatus: this.scanEnabled ? ScanStatus.PENDING : ScanStatus.CLEAN,
      },
      select: { id: true },
    });
    return { attachmentId: attachment.id };
  }

  /** Küçük resim + boyut sunucuda üretilir (istemci yok); hata ek oluşturmayı düşürmez, üç alan null kalır. */
  private async posterOf(outputKey: string): Promise<VideoPoster | null> {
    try {
      const bytes = await this.storage.getBuffer(outputKey, AI_OUTPUT_MAX_BYTES);
      return await extractVideoPoster(bytes, this.ffmpegPath, this.ffprobePath);
    } catch (err) {
      this.logger.warn(`video küçük resmi üretilemedi: ${(err as Error).message}`);
      return null;
    }
  }
}
