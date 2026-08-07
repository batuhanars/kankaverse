import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ALLOWED_IMAGE_TYPES } from '../image-upload.service';

export class PresignAvatarDto {
  @ApiProperty({
    example: 'image/png',
    enum: ALLOWED_IMAGE_TYPES,
    description: 'Yüklenecek avatar dosyasının içerik tipi (GIF desteklenmez).',
  })
  @IsIn(ALLOWED_IMAGE_TYPES, {
    message: 'Bu dosya türü desteklenmiyor. PNG, JPEG veya WebP kullanın.',
  })
  contentType: string;
}
