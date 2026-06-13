import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Presigned URL geçerlilik süresi (saniye) — kısa ömürlü
const PRESIGN_EXPIRES_SECONDS = 300;

/**
 * S3-uyumlu storage soyutlaması (EmailService deseni).
 * Sağlayıcı-agnostik: MinIO (dev) veya S3-uyumlu prod sağlayıcısı.
 * forcePathStyle: true → MinIO zorunlu (virtual-hosted path yerine path-style URL).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private config: ConfigService) {
    const endpoint = config.get<string>('s3.endpoint')!;
    const region = config.get<string>('s3.region')!;
    const accessKeyId = config.get<string>('s3.accessKey')!;
    const secretAccessKey = config.get<string>('s3.secretKey')!;
    this.bucket = config.get<string>('s3.bucket')!;

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      // MinIO için zorunlu: path-style URL (virtual-hosted desteklemez)
      forcePathStyle: true,
    });
  }

  /**
   * Dosya yükleme için presigned PUT URL üretir.
   * İstemci bu URL'ye doğrudan PUT yapar (backend dosya byte'ı taşımaz).
   */
  async presignPut(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });
    this.logger.debug(`presignPut: key=${key} contentType=${contentType}`);
    return url;
  }

  /**
   * Dosya indirme için presigned GET URL üretir (kısa ömürlü).
   * İstemci bu URL'yi bearer header olmadan kullanır.
   */
  async presignGet(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });
    this.logger.debug(`presignGet: key=${key}`);
    return url;
  }

  /**
   * S3'ten nesneyi sil.
   */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.debug(`delete: key=${key}`);
  }
}
