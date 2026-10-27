import { IsInt, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** C19 — ortam simgesi/afişi kaynağı presign gövdesi (hedef yol/uçtan belli; profil DTO'sundan farkı `target` yok). */
export class PresignGuildAnimatedDto {
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
