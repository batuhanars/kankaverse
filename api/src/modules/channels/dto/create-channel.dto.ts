import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  IsIn,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsChannelName } from '../../../common/utils/emoji-name.validators';
import { normalizeChannelName } from '../../../common/utils/channel-name.util';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({ example: '🎮-oyun-odası' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeChannelName(value) : value,
  )
  @IsChannelName()
  name: string;

  @ApiPropertyOptional({
    example: 'GUILD_VOICE',
    enum: ['GUILD_TEXT', 'GUILD_VOICE'],
    description: 'Kanal türü (varsayılan GUILD_TEXT)',
  })
  @IsOptional()
  @IsIn(['GUILD_TEXT', 'GUILD_VOICE'], { message: 'Geçersiz kanal türü.' })
  type?: 'GUILD_TEXT' | 'GUILD_VOICE';

  @ApiPropertyOptional({ example: false, description: '18+ yaş-kapılı kanal (varsayılan false)' })
  @IsOptional()
  @IsBoolean()
  ageGated?: boolean;

  @ApiPropertyOptional({
    example: 5,
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
    description: 'Özel kanal — yalnız OWNER/ADMIN ve izin verilen üyeler erişir (varsayılan false)',
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
}
