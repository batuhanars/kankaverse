import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { createWriteStream } from 'fs';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { buildAttachmentContentDisposition } from '../../common/utils/content-disposition.util';

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
  // C8-fix: profil görselleri (avatar/afiş) için public bucket. Dev'de ana bucket'a düşer.
  private readonly publicBucket: string;

  constructor(private config: ConfigService) {
    const endpoint = config.get<string>('s3.endpoint')!;
    const region = config.get<string>('s3.region')!;
    const accessKeyId = config.get<string>('s3.accessKey')!;
    const secretAccessKey = config.get<string>('s3.secretKey')!;
    this.bucket = config.get<string>('s3.bucket')!;
    this.publicBucket = config.get<string>('s3.publicBucket') ?? this.bucket;

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      // MinIO için zorunlu: path-style URL (virtual-hosted desteklemez)
      forcePathStyle: true,
      // Presigned PUT uyumluluğu: tarayıcı x-amz-checksum-* başlıklarını gönderemez.
      // SDK v3.729+ ile bu seçenekler checksum eklenmesini yalnız zorunlu durumlara kısıtlar.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
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
   * C8-fix: PUBLIC bucket'a presigned PUT (avatar/afiş). Nesne public bucket'a yazılır → özel alan adından
   * imzasız <img> GET ile sunulur. Mesaj ekleri bunun DIŞINDA (private bucket, presignPut/presignGet).
   */
  async presignPutPublic(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.publicBucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });
    this.logger.debug(`presignPutPublic: bucket=${this.publicBucket} key=${key}`);
    return url;
  }

  /**
   * Dosya indirme için presigned GET URL üretir (kısa ömürlü).
   * İstemci bu URL'yi bearer header olmadan kullanır.
   * C15: `downloadFilename` verilirse yanıt `Content-Disposition: attachment` taşır (tarayıcı indirir).
   */
  async presignGet(key: string, opts?: { downloadFilename?: string }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(opts?.downloadFilename !== undefined && {
        ResponseContentDisposition: buildAttachmentContentDisposition(
          opts.downloadFilename,
          'kankaverse-indirme',
        ),
      }),
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
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.debug(`delete: key=${key}`);
  }

  // ─── C13: sunucu tarafı işleme (hareketli profil görseli) ────────────────

  /** Özel bucket'taki nesnenin gerçek boyutu (bayt). Yoksa fırlatır. */
  async headSize(key: string): Promise<number> {
    const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.ContentLength ?? 0;
  }

  /**
   * Özel bucket nesnesini yerel dosyaya indirir. `maxBytes` aşılırsa akış kesilir ve fırlatır
   * (HEAD ile gerçek boyut zaten kontrol edildi; bu ikinci emniyet).
   */
  async downloadToFile(key: string, destPath: string, maxBytes: number): Promise<void> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    let seen = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        seen += chunk.length;
        if (seen > maxBytes) return cb(new Error('FILE_TOO_LARGE'));
        cb(null, chunk);
      },
    });
    await pipeline(res.Body as Readable, limiter, createWriteStream(destPath));
  }

  /** Sunucunun ürettiği nesneyi PUBLIC bucket'a yazar (profil görselleri). */
  async putPublic(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.publicBucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.debug(`putPublic: bucket=${this.publicBucket} key=${key}`);
  }

  /** PUBLIC bucket'tan nesne sil (yalnız kullanıcının kendi değiştirmesinde; takedown'da ÇAĞRILMAZ). */
  async deletePublic(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.publicBucket, Key: key }));
    this.logger.debug(`deletePublic: key=${key}`);
  }
}
