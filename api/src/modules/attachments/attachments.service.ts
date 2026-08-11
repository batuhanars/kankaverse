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

// İzin verilen içerik tipleri (allowlist) — genişletme config değişikliğiyle gelir.
//
// C12+ (sahip kararı 2026-08-11): düz metin ailesi ve arşivler eklendi. Gerekçe somuttu —
// bir md dosyası yığınını zip'leyip göndermek istendi, ikisi de reddediliyordu.
//
// 🔴 Arşivlerin İÇİNE BAKAMIYORUZ. Zip kabul etmek "bir tür daha" değil, allowlist'i o dosya
// için askıya almaktır: içinde exe de olabilir. Bilerek kabul edildi. Riski sınırlayan iki şey:
// (1) mesaj ekleri PUBLIC DEĞİL — özel bucket, kısa ömürlü imzalı GET (`presignGet`), yani
// kendi alan adımızda barındırılan bir indirme bağlantısı üretmiyoruz; (2) tarama açıldığında
// (`SCAN`) arşivler bilinen bir kör nokta olarak kalacak, bu not oraya taşınmalı.
//
// 🔴 ASLA eklenmeyecekler: çalıştırılabilirler (exe, msi, bat, cmd, sh, apk, jar, scr, com, pif),
// kısayol (lnk) ve tarayıcıda ÇALIŞAN türler (html, htm, svg, xml). Sonuncular bugün zararsız
// görünüyor çünkü ekler imzalı URL'den iniyor; biri onları listeye eklerse indirmeye
// `Content-Disposition: attachment` koymak ZORUNLU hale gelir (bugün konmuyor — görseller
// sohbette satır içi gösterildiği için kasıtlı).
//
// Not: istemciler `application/x-zip-compressed` gibi platform türevlerini uzantıdan buradaki
// kanonik türe çevirir (bkz. mobile `resolveContentType`, web `attachmentType.ts`).
const ALLOWED_CONTENT_TYPES = new Set([
  // Görsel
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  // Belge
  'application/pdf',
  // Düz metin ailesi (md/csv/json ayrı tür, log/yml/ini text/plain'e düşer)
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  // Arşiv (içerik görünmez — yukarıdaki nota bak)
  'application/zip',
  'application/vnd.rar',
  'application/x-7z-compressed',
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
    if (!this.config.get<boolean>('uploadsEnabled')) {
      throw new ForbiddenException({
        message: 'Dosya yükleme şu an kapalı.',
        error: 'UPLOADS_DISABLED',
      });
    }

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
