import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReauthFieldsDto } from './reauth-fields.dto';
import { IntersectionType } from '@nestjs/swagger';

class NewPasswordFields {
  @ApiProperty({ description: 'Yeni şifre (min 8, max 128 karakter)' })
  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır.' })
  @MaxLength(128, { message: 'Şifre en fazla 128 karakter olabilir.' })
  @IsNotEmpty()
  newPassword: string;
}

export class ChangePasswordDto extends IntersectionType(ReauthFieldsDto, NewPasswordFields) {}
