import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** POST /admin/platform-invites — giriş */
export class CreatePlatformInviteDto {
  @ApiPropertyOptional({ example: 100, description: 'Maksimum kullanım sayısı (1–10000). null = sınırsız.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxUses?: number;

  @ApiPropertyOptional({ example: 168, description: 'Sona erme süresi (saat, 1–8760). null = süresiz.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  expiresInHours?: number;

  @ApiPropertyOptional({ example: 'Yayıncı testi — beta grubu', description: 'Admin notu (≤200 karakter).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/** Platform davet DTO — çıkış */
export class PlatformInviteDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiPropertyOptional({ nullable: true }) maxUses: number | null;
  @ApiProperty() uses: number;
  @ApiPropertyOptional({ nullable: true }) expiresAt: string | null;
  @ApiPropertyOptional({ nullable: true }) disabledAt: string | null;
  @ApiProperty() createdAt: string;
}
