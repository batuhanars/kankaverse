import { IsString, IsBoolean, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateChannelDto {
  @ApiPropertyOptional({ example: 'yeni-ad' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Kanal adı en az 2 karakter olmalıdır.' })
  @MaxLength(50, { message: 'Kanal adı en fazla 50 karakter olabilir.' })
  @Matches(/^[a-z0-9-]+$/, { message: 'Kanal adı yalnızca küçük harf, rakam ve tire içerebilir.' })
  name?: string;

  @ApiPropertyOptional({ example: true, description: '18+ yaş-kapılı kanal' })
  @IsOptional()
  @IsBoolean()
  ageGated?: boolean;
}
