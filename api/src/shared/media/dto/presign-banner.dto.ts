import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ALLOWED_IMAGE_TYPES } from '../image-upload.service';

/** Profil afişi (kullanıcı) VE ortam afişi (guild) presign'inde ortak — ikisi de aynı "afiş" kavramı. */
export class PresignBannerDto {
  @ApiProperty({ example: 'image/png', enum: ALLOWED_IMAGE_TYPES, description: 'Yüklenecek afiş dosyasının içerik tipi (GIF desteklenmez).' })
  @IsIn(ALLOWED_IMAGE_TYPES, { message: 'Bu dosya türü desteklenmiyor. PNG, JPEG veya WebP kullanın.' })
  contentType: string;
}
