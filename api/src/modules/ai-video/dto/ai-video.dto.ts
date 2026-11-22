import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AI_INPUT_ANY_MAX_BYTES,
  AI_INPUT_KINDS,
  AI_INPUT_TYPES,
  AI_PROMPT_MAX,
  AI_REFERENCES_MAX,
} from '../ai-video.constants';
import type { AiInputKind } from '../ai-video.constants';

export class PresignAiInputDto {
  @ApiProperty({ enum: Object.keys(AI_INPUT_TYPES) })
  @IsIn(Object.keys(AI_INPUT_TYPES), {
    message: 'Bu dosya türü kullanılamaz.',
  })
  contentType!: string;

  @ApiProperty({
    description: 'Bayt cinsinden boyut (görsel/ses en çok 10 MB, video en çok 50 MB)',
  })
  @IsInt()
  @Min(1)
  @Max(AI_INPUT_ANY_MAX_BYTES, { message: 'Dosya çok büyük.' })
  size!: number;
}

/** C42: referans türü ve girdi anahtarı (sıra = istemdeki numara sırası, türü içinde). */
export class AiVideoReferenceDto {
  @ApiProperty({ enum: AI_INPUT_KINDS })
  @IsIn(AI_INPUT_KINDS)
  kind!: AiInputKind;

  @ApiProperty({ description: 'presign yanıtındaki inputKey' })
  @IsString()
  @MaxLength(300)
  key!: string;
}

export class EstimateAiVideoDto {
  @ApiProperty({ example: 'pika-2.5' })
  @IsString()
  @MaxLength(40)
  model!: string;

  @ApiProperty({ example: '720p' })
  @IsString()
  @MaxLength(10)
  resolution!: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  durationS!: number;

  @ApiProperty({ description: 'Görselden üretim mi (fiyat görsele değil api yoluna bağlı)' })
  @IsBoolean()
  withImage!: boolean;

  @ApiPropertyOptional({
    enum: AI_INPUT_KINDS,
    isArray: true,
    description: 'C42: verilirse kip referanstır (omni), withImage yok sayılır. Her ek bir tür.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AI_REFERENCES_MAX)
  @IsIn(AI_INPUT_KINDS, { each: true })
  referenceKinds?: AiInputKind[];

  @ApiPropertyOptional({
    example: '16:9',
    description: 'Yoksa Otomatik (alan sağlayıcıya gönderilmez)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  aspectRatio?: string;
}

/** `POST /ai-video`: teklif + tavan + gönderim tek çağrıda (C14b §2.2). */
export class CreateAiVideoDto {
  @ApiProperty({ example: 'pika-2.5' })
  @IsString()
  @MaxLength(40)
  model!: string;

  @ApiProperty({ example: '720p' })
  @IsString()
  @MaxLength(10)
  resolution!: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  durationS!: number;

  @ApiProperty({ maxLength: AI_PROMPT_MAX, description: 'Görselden üretimde boş olabilir' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(AI_PROMPT_MAX, { message: 'İstem çok uzun.' })
  prompt!: string;

  @ApiPropertyOptional({ description: 'presign yanıtındaki inputKey (görselden üretim)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  inputKey?: string;

  @ApiPropertyOptional({
    type: [AiVideoReferenceDto],
    description: 'C42: çoklu referans (omni). inputKey ile birlikte verilemez.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AI_REFERENCES_MAX)
  @ValidateNested({ each: true })
  @Type(() => AiVideoReferenceDto)
  references?: AiVideoReferenceDto[];

  @ApiPropertyOptional({
    example: '16:9',
    description: 'Yoksa Otomatik (alan sağlayıcıya gönderilmez)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  aspectRatio?: string;
}
