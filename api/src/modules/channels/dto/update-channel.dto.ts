import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsChannelName } from '../../../common/utils/emoji-name.validators';
import { normalizeChannelName } from '../../../common/utils/channel-name.util';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateChannelDto {
  @ApiPropertyOptional({ example: '📢-duyurular' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeChannelName(value) : value,
  )
  @IsChannelName()
  name?: string;

  @ApiPropertyOptional({ example: true, description: '18+ yaş-kapılı kanal' })
  @IsOptional()
  @IsBoolean()
  ageGated?: boolean;

  @ApiPropertyOptional({
    example: 10,
    description: 'Yavaş mod gecikmesi (saniye, 0=kapalı, maks 21600)',
  })
  @IsOptional()
  @IsInt({ message: 'Yavaş mod değeri tam sayı olmalıdır.' })
  @Min(0, { message: 'Yavaş mod değeri 0 veya daha büyük olmalıdır.' })
  @Max(21600, { message: 'Yavaş mod değeri en fazla 21600 saniye (6 saat) olabilir.' })
  slowModeSeconds?: number;

  @ApiPropertyOptional({ example: 'cat-id', description: 'Kategori ID (null = kategorisiz)' })
  @IsOptional()
  @ValidateIf((o: { categoryId?: string | null }) => o.categoryId !== null)
  @IsString()
  categoryId?: string | null;

  @ApiPropertyOptional({
    example: false,
    description: 'Özel kanal — yalnız OWNER/ADMIN ve izin verilen üyeler erişir',
  })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiPropertyOptional({
    example: 10,
    description: 'Ses kanalı kullanıcı limiti (yalnız GUILD_VOICE; 0=sınırsız, maks 99)',
  })
  @IsOptional()
  @IsInt({ message: 'Kullanıcı limiti tam sayı olmalıdır.' })
  @Min(0, { message: 'Kullanıcı limiti 0 veya daha büyük olmalıdır.' })
  @Max(99, { message: 'Kullanıcı limiti en fazla 99 olabilir.' })
  userLimit?: number;

  @ApiPropertyOptional({
    example: 64,
    description: 'Ses kanalı bit hızı (yalnız GUILD_VOICE; kbps, 8–96)',
  })
  @IsOptional()
  @IsInt({ message: 'Bit hızı tam sayı olmalıdır.' })
  @Min(8, { message: 'Bit hızı en az 8 kbps olmalıdır.' })
  @Max(96, { message: 'Bit hızı en fazla 96 kbps olabilir.' })
  bitrate?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      'Ses kanalında kamera/ekran yayını açık mı (GUILD_VOICE; varsayılan: kapalı — admin bilinçle açar)',
  })
  @IsOptional()
  @IsBoolean()
  mediaEnabled?: boolean;

  @ApiPropertyOptional({
    example: false,
    description:
      'C57: salt okunur metin kanalı (GUILD_TEXT). Açıkken yalnız kanal yönetme yetkisi olanlar mesaj yazar; diğerleri okur',
  })
  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;
}
