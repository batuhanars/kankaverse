import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PresignAttachmentDto } from './dto/presign-attachment.dto';

// İzin verilen içerik tipleri (allowlist) — genişletme config değişikliğiyle gelir
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

/**
 * Tahmin-edilemez storage key üretir: cuid2 + orijinal uzantı.
 * cuid2 çakışmaz ve tahmin edilemez (rastgele). uuid de kullanılabilirdi;
 * cuid2 daha kısa ve URL dostu.
 */
function buildStorageKey(filename: string): string {
  const ext = filename.includes('.') ? filename.split('.').pop() : '';
  const id = randomUUID().replace(/-/g, '');
  return ext ? `${id}.${ext}` : id;
}

@Injectable()
export class AttachmentsService {
  private readonly maxUploadBytes: number;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private membership: MembershipService,
    private config: ConfigService,
  ) {
    const maxMb = config.get<number>('maxUploadMb') ?? 25;
    this.maxUploadBytes = maxMb * 1024 * 1024;
  }

  /**
   * POST /attachments/presign
   * Doğrulama: boyut + contentType allowlist.
   * Attachment (PENDING, messageId=null) oluşturur → { attachmentId, uploadUrl, storageKey }.
   */
  async presign(userId: string, dto: PresignAttachmentDto) {
    if (dto.size > this.maxUploadBytes) {
      throw new BadRequestException({
        message: `Dosya boyutu ${this.config.get<number>('maxUploadMb') ?? 25} MB sınırını aşıyor.`,
        error: 'FILE_TOO_LARGE',
      });
    }

    if (!ALLOWED_CONTENT_TYPES.has(dto.contentType)) {
      throw new BadRequestException({
        message: 'Bu dosya türü desteklenmiyor.',
        error: 'UNSUPPORTED_TYPE',
      });
    }

    const storageKey = buildStorageKey(dto.filename);

    const attachment = await this.prisma.attachment.create({
      data: {
        uploaderId: userId,
        storageKey,
        filename: dto.filename,
        contentType: dto.contentType,
        size: dto.size,
        // scanStatus PENDING (default) — mesaj bağlanınca scan-gate devreye girer
      },
    });

    const uploadUrl = await this.storage.presignPut(storageKey, dto.contentType);

    return {
      attachmentId: attachment.id,
      uploadUrl,
      storageKey,
    };
  }

  /**
   * GET /attachments/:id
   * [R7] Erişim kapısı sırası:
   *   1. Attachment + mesaj varlık kontrolü (messageId null → 404 henüz iliştirilmemiş)
   *   2. requireChannelAccess (üyelik + minör/adultsOnly kapıları)
   *   3. scanStatus CLEAN değilse → 403 (PENDING → ATTACHMENT_NOT_READY, FLAGGED → ATTACHMENT_BLOCKED)
   *   4. CLEAN → presignGet ile kısa ömürlü URL → { url }
   *
   * Redirect DEĞİL (istemci auth header taşıyamadığı için presigned URL body'de döner).
   */
  async getDownloadUrl(userId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { message: { select: { channelId: true } } },
    });

    if (!attachment) {
      throw new NotFoundException({
        message: 'Dosya bulunamadı.',
        error: 'ATTACHMENT_NOT_FOUND',
      });
    }

    // messageId null → henüz iliştirilmemiş; erişim yok
    if (!attachment.messageId || !attachment.message) {
      throw new NotFoundException({
        message: 'Dosya bulunamadı.',
        error: 'ATTACHMENT_NOT_FOUND',
      });
    }

    // [R7] Kanal erişim kontrolü: üyelik + minör/adultsOnly kapıları
    await this.membership.requireChannelAccess(userId, attachment.message.channelId);

    // Scan kapısı: CLEAN değilse servis etme
    if (attachment.scanStatus === 'FLAGGED') {
      throw new ForbiddenException({
        message: 'Bu dosya güvenlik kontrolünden geçemedi.',
        error: 'ATTACHMENT_BLOCKED',
      });
    }

    if (attachment.scanStatus !== 'CLEAN') {
      // PENDING veya bilinmeyen durum
      throw new ForbiddenException({
        message: 'Bu dosya henüz hazır değil, lütfen bekleyin.',
        error: 'ATTACHMENT_NOT_READY',
      });
    }

    const url = await this.storage.presignGet(attachment.storageKey);
    return { url };
  }
}
