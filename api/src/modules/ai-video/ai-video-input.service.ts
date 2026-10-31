import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService } from '../../shared/storage/storage.service';
import {
  AI_INPUT_PREFIX,
  AI_INPUT_TYPES,
  AiInputKind,
  inputTypeOfKey,
  MB,
} from './ai-video.constants';
import { PikaClient } from './pika.client';

const INPUT_EXT_PATTERN = Object.values(AI_INPUT_TYPES)
  .map((t) => t.ext)
  .join('|');
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** C14/C42 — üretim girdisi (görsel, video, ses): presign, anahtar doğrulama, Pika yüklemesi. */
@Injectable()
export class AiVideoInputService {
  constructor(
    private storage: StorageService,
    private pika: PikaClient,
  ) {}

  async presignInput(userId: string, contentType: string, size: number) {
    const type = AI_INPUT_TYPES[contentType];
    if (!type) {
      throw new BadRequestException({
        message:
          'Yalnızca PNG, JPEG, WebP görsel, MP4, MOV, WebM video veya MP3, M4A, AAC, WAV, OGG, WebM ses kullanılabilir.',
        error: 'UNSUPPORTED_TYPE',
      });
    }
    if (size > type.maxBytes) throw this.tooLarge(type);
    const inputKey = `${AI_INPUT_PREFIX}/${userId}/${randomUUID()}.${type.ext}`;
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
        message: 'Dosya bulunamadı. Yeniden yükle.',
        error: 'INVALID_STORAGE_KEY',
      });
    }
    const type = inputTypeOfKey(key)![1];
    if (size > type.maxBytes) throw this.tooLarge(type);
  }

  private tooLarge(type: { kind: AiInputKind; maxBytes: number }) {
    const label = { image: 'Görsel', video: 'Video', audio: 'Ses' }[type.kind];
    return new BadRequestException({
      message: `${label} en fazla ${type.maxBytes / MB} MB olabilir.`,
      error: 'FILE_TOO_LARGE',
    });
  }

  /** Özel bucket'tan oku, Pika yüklemesine koy; dönen adres modelin ilgili alanına girer. */
  async uploadToPika(inputKey: string): Promise<string> {
    const [contentType, type] = inputTypeOfKey(inputKey)!;
    const bytes = await this.storage.getBuffer(inputKey, type.maxBytes);
    const upload = await this.pika.createUpload(contentType, bytes.length);
    await this.pika.putUpload(upload, bytes, contentType);
    return upload.url;
  }
}
