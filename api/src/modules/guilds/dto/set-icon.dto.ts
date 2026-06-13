import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SetIconDto {
  @ApiPropertyOptional({
    example: 'icons/guild-abc/550e8400-e29b-41d4-a716-446655440000.png',
    description: 'Yüklenen ikonun storage anahtarı. null gönderilirse ikon kaldırılır.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  storageKey?: string | null;
}
