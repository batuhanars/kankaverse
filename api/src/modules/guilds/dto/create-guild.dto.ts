import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGuildDto {
  @ApiProperty({ example: 'Oyun Klanı' })
  @IsString()
  @MinLength(2, { message: 'Sunucu adı en az 2 karakter olmalıdır.' })
  @MaxLength(64, { message: 'Sunucu adı en fazla 64 karakter olabilir.' })
  name: string;
}
