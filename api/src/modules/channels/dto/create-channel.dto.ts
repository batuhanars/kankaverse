import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({ example: 'oyun-odasi' })
  @IsString()
  @MinLength(2, { message: 'Kanal adı en az 2 karakter olmalıdır.' })
  @MaxLength(64, { message: 'Kanal adı en fazla 64 karakter olabilir.' })
  @Matches(/^[a-z0-9-]+$/, { message: 'Kanal adı yalnızca küçük harf, rakam ve tire içerebilir.' })
  name: string;
}
