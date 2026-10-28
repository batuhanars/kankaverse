import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AI_INPUT_MAX_BYTES, AI_INPUT_TYPES, AI_PROMPT_MAX } from '../ai-video.constants';

export class PresignAiInputDto {
  @ApiProperty({ enum: Object.keys(AI_INPUT_TYPES) })
  @IsIn(Object.keys(AI_INPUT_TYPES), {
    message: 'Yalnızca PNG, JPEG veya WebP görsel kullanılabilir.',
  })
  contentType!: string;

  @ApiProperty({ description: 'Bayt cinsinden boyut (en çok 10 MB)' })
  @IsInt()
  @Min(1)
  @Max(AI_INPUT_MAX_BYTES, { message: 'Görsel en fazla 10 MB olabilir.' })
  size!: number;
}

export class QuoteAiVideoDto {
  @ApiProperty({ maxLength: AI_PROMPT_MAX, description: 'Görselden üretimde boş olabilir' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(AI_PROMPT_MAX, { message: 'İstem en fazla 1000 karakter olabilir.' })
  prompt!: string;

  @ApiPropertyOptional({ description: 'presign yanıtındaki inputKey (görselden üretim)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  inputKey?: string;
}
