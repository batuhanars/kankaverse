import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { StorageService } from '../storage/storage.service';

/**
 * C8 — statik görsel yükleme (avatar / profil-afişi / ortam-afişi) için paylaşılan presign helper'ı.
 * Rule of Three: bu üç yeni yüzey aynı desenin 3. tekrarı (ortam ikonu = mevcut 1. — o kod
 * YENİDEN YAZILMAZ, olduğu gibi kalır). GIF YOK (statik yükleme kararı, sözleşme §0).
 */

// Avatar/afiş için izin verilen görsel tipler (allowlist) — GIF kasıtlı olarak YOK.
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const ALLOWED_IMAGE_TYPE_SET = new Set<string>(ALLOWED_IMAGE_TYPES);

const IMAGE_EXT: Record<AllowedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface PresignResult {
  uploadUrl: string;
  storageKey: string;
}

@Injectable()
export class ImageUploadService {
  constructor(
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  /**
   * Presigned PUT URL üretir.
   * 1. uploadsEnabled kapalıysa → UPLOADS_DISABLED 403.
   * 2. contentType allowlist dışıysa → UNSUPPORTED_TYPE 400.
   * 3. storageKey = `${prefix}/${ownerId}/${uuid}.${ext}`.
   */
  async presign(prefix: string, ownerId: string, contentType: string): Promise<PresignResult> {
    this.assertUploadsEnabled();

    if (!ALLOWED_IMAGE_TYPE_SET.has(contentType)) {
      throw new BadRequestException({
        message: 'Bu dosya türü desteklenmiyor. PNG, JPEG veya WebP kullanın.',
        error: 'UNSUPPORTED_TYPE',
      });
    }

    const ext = IMAGE_EXT[contentType as AllowedImageType];
    const storageKey = `${prefix}/${ownerId}/${randomUUID()}.${ext}`;
    const uploadUrl = await this.storage.presignPut(storageKey, contentType);

    return { uploadUrl, storageKey };
  }

  /**
   * Savunma-derinliği (D14 dersi): presign kapalıyken "set" yolu da reddetmeli
   * (yalnız görsel KALDIRMA — storageKey null — bu kapının dışında, çağıran taraf uygular).
   */
  assertUploadsEnabled(): void {
    if (!this.config.get<boolean>('uploadsEnabled')) {
      throw new ForbiddenException({
        message: 'Dosya yükleme şu an kapalı.',
        error: 'UPLOADS_DISABLED',
      });
    }
  }

  /** storageKey beklenen prefix ile başlamıyorsa → INVALID_STORAGE_KEY 400. */
  assertKeyPrefix(storageKey: string, expectedPrefix: string): void {
    if (!storageKey.startsWith(`${expectedPrefix}/`)) {
      throw new BadRequestException({
        message: 'Geçersiz storage anahtarı.',
        error: 'INVALID_STORAGE_KEY',
      });
    }
  }

  /** storageKey → public URL (S3 public base + key). */
  publicUrl(storageKey: string): string {
    const publicBase = this.config.get<string>('s3.publicUrl')!;
    return `${publicBase}/${storageKey}`;
  }
}
