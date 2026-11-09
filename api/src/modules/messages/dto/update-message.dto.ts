import { IsString, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MESSAGE_CONTENT_MAX } from '../messages.constants';

export class UpdateMessageDto {
  @ApiProperty({ example: 'Düzenlenmiş mesaj içeriği', maxLength: MESSAGE_CONTENT_MAX })
  @IsString()
  @IsNotEmpty({ message: 'Mesaj içeriği boş olamaz.' })
  @MaxLength(MESSAGE_CONTENT_MAX, { message: 'Mesaj en fazla 16.000 karakter olabilir.' })
  content: string;
}
