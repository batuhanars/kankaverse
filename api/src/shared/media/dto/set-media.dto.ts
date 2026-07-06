import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Avatar/profil-afişi/ortam-afişi set endpoint'lerinde paylaşılan gövde. null → kaldır. */
export class SetMediaDto {
  @ApiPropertyOptional({
    example: 'avatars/user-abc/550e8400-e29b-41d4-a716-446655440000.png',
    description: 'Yüklenen görselin storage anahtarı. null gönderilirse görsel kaldırılır.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  storageKey?: string | null;
}
