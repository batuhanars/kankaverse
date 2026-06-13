import { IsString, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMessageDto {
  @ApiProperty({ example: 'Düzenlenmiş mesaj içeriği' })
  @IsString()
  @IsNotEmpty({ message: 'Mesaj içeriği boş olamaz.' })
  @MaxLength(4000, { message: 'Mesaj en fazla 4000 karakter olabilir.' })
  content: string;
}
