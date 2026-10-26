import { IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** C13 — hareketli profil görseli presign gövdesi. contentType allowlist'i serviste (UNSUPPORTED_TYPE kodu için). */
export class PresignAnimatedDto {
  @ApiProperty({ enum: ['AVATAR', 'BANNER'] })
  @IsIn(['AVATAR', 'BANNER'])
  target: 'AVATAR' | 'BANNER';

  @ApiProperty({
    example: 'video/mp4',
    description:
      'image/gif, video/mp4, video/webm, video/quicktime, image/png, image/jpeg, image/webp',
  })
  @IsString()
  contentType: string;

  @ApiProperty({ example: 1048576, description: 'Dosya boyutu (bayt)' })
  @IsInt()
  @Min(1)
  size: number;
}

/** C13 — işle gövdesi (avatar/banner endpoint'leri ortak). */
export class ProcessAnimatedDto {
  @ApiProperty({ example: 'animated-staging/<userId>/<uuid>.mp4' })
  @IsString()
  stagingKey: string;

  @ApiPropertyOptional({
    description: 'Video kesit başlangıcı (ms). GIF için yok sayılır. Varsayılan 0.',
  })
  @IsOptional()
  @IsNumber()
  startMs?: number;

  @ApiPropertyOptional({
    description: 'Kesit süresi (ms, 500-6000). Varsayılan min(6000, video süresi).',
  })
  @IsOptional()
  @IsNumber()
  durationMs?: number;

  @ApiPropertyOptional({
    description:
      'Kaynağın genişlik/yüksekliğine oranla 0-1 kesirler: { x, y, width, height }. Yoksa merkezden kırpılır. ' +
      'Değerler serviste doğrulanır (INVALID_CROP 400); oran hedefe sunucuda oturtulur.',
    example: { x: 0.1, y: 0.25, width: 0.8, height: 0.32 },
  })
  @IsOptional()
  @IsObject()
  crop?: { x: number; y: number; width: number; height: number };
}
