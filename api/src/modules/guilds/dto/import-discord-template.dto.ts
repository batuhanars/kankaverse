import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ImportDiscordTemplateDto {
  @ApiProperty({
    example: 'https://discord.new/abc123',
    description: 'Discord sunucu şablonu linki veya ham kodu',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  template!: string;

  @ApiProperty({ required: false, description: 'Yeni Ortam adı (boşsa şablon adı kullanılır)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;
}
