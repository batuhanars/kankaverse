import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsIn,
  ArrayMaxSize,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BANNER_PRESET_KEYS } from '../../../common/banner-presets';

export class UpdateGuildDto {
  @ApiPropertyOptional({ example: 'Yeni Ortam Adı' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Ortam adı en az 2 karakter olmalıdır.' })
  @MaxLength(50, { message: 'Ortam adı en fazla 50 karakter olabilir.' })
  name?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  adultsOnly?: boolean;

  @ApiPropertyOptional({ example: 'Ortamımıza hoş geldiniz! Burası ne hakkında, kısaca anlat.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Ortam açıklaması en fazla 2000 karakter olabilir.' })
  description?: string;

  // C6 — Keşfet'te göster (opt-in)
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  discoverable?: boolean;

  // C6 — ilgi etiketleri (max 5; her biri ≤30 char; servis normalize: trim+lowercase+tekil)
  @ApiPropertyOptional({ example: ['oyun', 'müzik'], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: 'En fazla 5 etiket ekleyebilirsiniz.' })
  @IsString({ each: true })
  @MaxLength(30, { each: true, message: 'Her etiket en fazla 30 karakter olabilir.' })
  tags?: string[];

  // C6 — afiş rengi (preset anahtar; allowlist)
  @ApiPropertyOptional({ example: 'blue', enum: BANNER_PRESET_KEYS })
  @IsOptional()
  @IsIn(BANNER_PRESET_KEYS, { message: 'Geçersiz afiş rengi.' })
  bannerColor?: string;
}
