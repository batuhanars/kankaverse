import { IsString, IsNotEmpty, IsInt, IsOptional, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PresignAttachmentDto {
  @ApiProperty({ example: 'görsel.png' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiProperty({ example: 1048576, description: 'Dosya boyutu (byte)' })
  @IsInt()
  @Min(1)
  size: number;

  // Üst sınır (5 dk) DTO'da DEĞİL serviste denetlenir: `@Max` genel doğrulama hatası verirdi,
  // sözleşme `DURATION_TOO_LONG` koduyla Türkçe mesaj ister.
  @ApiPropertyOptional({
    example: 7300,
    description:
      'Yalnız ses ekinde (audio/*): süre, ms. En fazla 300000 (5 dk); ses dışında yok sayılır.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMs?: number;

  @ApiPropertyOptional({
    example: 'AAECAwQF...',
    description:
      'Yalnız ses ekinde (audio/*): dalga formu, 64 örnek (0-255) base64 (88 karakter); ses dışında yok sayılır.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  waveform?: string;

  @ApiPropertyOptional({
    description:
      'Yalnız video ekinde (video/*): küçük resim, base64 JPEG; video dışında yok sayılır.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40000)
  thumbnail?: string;

  @ApiPropertyOptional({ example: 1280, description: 'Yalnız video ekinde: genişlik (px).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  width?: number;

  @ApiPropertyOptional({ example: 720, description: 'Yalnız video ekinde: yükseklik (px).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  height?: number;
}
