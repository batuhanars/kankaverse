import {
  IsString,
  MaxLength,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsNotEmpty,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiPropertyOptional({ example: 'Merhaba kankaverse!' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Mesaj içeriği boş string olamaz.' })
  @MaxLength(4000, { message: 'Mesaj en fazla 4000 karakter olabilir.' })
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  replyToId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Eklenecek dosya ID\'leri (presign sonrası)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'Bir mesaja en fazla 10 dosya eklenebilir.' })
  @IsString({ each: true })
  attachmentIds?: string[];
}
