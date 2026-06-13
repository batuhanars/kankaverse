import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresignIconDto {
  @ApiProperty({ example: 'image/png', description: 'Yüklenen ikon dosyasının içerik tipi' })
  @IsString()
  @IsNotEmpty()
  contentType: string;
}
