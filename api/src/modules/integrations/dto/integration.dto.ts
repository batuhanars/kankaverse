import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateIntegrationDto {
  @ApiProperty({ description: 'Profil kartında göster' })
  @IsBoolean()
  showOnProfile: boolean;
}

export class PutStreamAnnounceDto {
  @ApiProperty({ description: 'Duyuruların yazılacağı metin kanalı (bu ortamdan)' })
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Bahsedilecek rol (bu ortamdan), isteğe bağlı',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  mentionRoleId?: string | null;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}
