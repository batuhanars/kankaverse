import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService } from '../../shared/storage/storage.service';
import { AI_INPUT_MAX_BYTES, AI_INPUT_PREFIX, AI_INPUT_TYPES } from './ai-video.constants';
import { PikaClient } from './pika.client';

const INPUT_EXT_PATTERN = Object.values(AI_INPUT_TYPES).join('|');
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** C14 — görselden üretimde girdi görseli: presign, anahtar doğrulama, Pika yüklemesi. */
@Injectable()
export class AiVideoInputService {
  constructor(
    private storage: StorageService,
    private pika: PikaClient,
  ) {}

  async presignInput(userId: string, contentType: string, size: number) {
    const ext = AI_INPUT_TYPES[contentType];
    if (!ext || size > AI_INPUT_MAX_BYTES) {
      throw new BadRequestException({
        message: 'Yalnızca en çok 10 MB boyutunda PNG, JPEG veya WebP görsel kullanılabilir.',
        error: 'UNSUPPORTED_TYPE',
      });
    }
    const inputKey = `${AI_INPUT_PREFIX}/${userId}/${randomUUID()}.${ext}`;
    const uploadUrl = await this.storage.presignPut(inputKey, contentType);
    return { uploadUrl, inputKey };
  }

  /** `ai-input/{userId}/{uuid}.{ext}` biçimi + sahiplik öneki + nesne var + boyut (C13 assertStagingKey deseni). */
  async assertInputKey(userId: string, key: string): Promise<void> {
    const safeUserId = userId.replace(/[^A-Za-z0-9-]/g, '\\$&');
    const re = new RegExp(
      `^${AI_INPUT_PREFIX}/${safeUserId}/${UUID_PATTERN}\\.(${INPUT_EXT_PATTERN})$`,
    );
    if (!re.test(key)) {
      throw new BadRequestException({
        message: 'Geçersiz storage anahtarı.',
        error: 'INVALID_STORAGE_KEY',
      });
    }
    let size: number;
    try {
      size = await this.storage.headSize(key);
    } catch {
      throw new BadRequestException({
        message: 'Görsel bulunamadı. Yeniden yükle.',
        error: 'INVALID_STORAGE_KEY',
      });
    }
    if (size > AI_INPUT_MAX_BYTES) {
      throw new BadRequestException({
        message: 'Görsel en fazla 10 MB olabilir.',
        error: 'FILE_TOO_LARGE',
      });
    }
  }

  private contentTypeOf(key: string): string {
    const ext = key.slice(key.lastIndexOf('.') + 1);
    return Object.entries(AI_INPUT_TYPES).find(([, e]) => e === ext)![0];
  }

  /** Özel bucket'tan oku, Pika yüklemesine koy; dönen adres modelin görsel alanına girer. */
  async uploadToPika(inputKey: string): Promise<string> {
    const contentType = this.contentTypeOf(inputKey);
    const bytes = await this.storage.getBuffer(inputKey, AI_INPUT_MAX_BYTES);
    const upload = await this.pika.createUpload(contentType, bytes.length);
    await this.pika.putUpload(upload, bytes, contentType);
    return upload.url;
  }
}
