import { IsString, IsBoolean, IsOptional, IsInt, Min, Max, MinLength, MaxLength, Matches, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateChannelDto {
  @ApiPropertyOptional({ example: 'yeni-ad' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Kanal adı en az 2 karakter olmalıdır.' })
  @MaxLength(50, { message: 'Kanal adı en fazla 50 karakter olabilir.' })
  @Matches(/^[a-z0-9-]+$/, { message: 'Kanal adı yalnızca küçük harf, rakam ve tire içerebilir.' })
  name?: string;

  @ApiPropertyOptional({ example: true, description: '18+ yaş-kapılı kanal' })
  @IsOptional()
  @IsBoolean()
  ageGated?: boolean;

  @ApiPropertyOptional({ example: 10, description: 'Yavaş mod gecikmesi (saniye, 0=kapalı, maks 21600)' })
  @IsOptional()
  @IsInt({ message: 'Yavaş mod değeri tam sayı olmalıdır.' })
  @Min(0, { message: 'Yavaş mod değeri 0 veya daha büyük olmalıdır.' })
  @Max(21600, { message: 'Yavaş mod değeri en fazla 21600 saniye (6 saat) olabilir.' })
  slowModeSeconds?: number;

  @ApiPropertyOptional({ example: 'cat-id', description: 'Kategori ID (null = kategorisiz)' })
  @IsOptional()
  @ValidateIf((o) => o.categoryId !== null)
  @IsString()
  categoryId?: string | null;

  @ApiPropertyOptional({ example: false, description: 'Özel kanal — yalnız OWNER/ADMIN ve izin verilen üyeler erişir' })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
