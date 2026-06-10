import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({ example: 'Merhaba kankaverse!' })
  @IsString()
  @MinLength(1, { message: 'Mesaj içeriği boş olamaz.' })
  @MaxLength(4000, { message: 'Mesaj en fazla 4000 karakter olabilir.' })
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  replyToId?: string;
}
