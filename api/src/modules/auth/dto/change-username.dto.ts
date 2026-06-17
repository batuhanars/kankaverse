import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { ReauthFieldsDto } from './reauth-fields.dto';

class NewUsernameField {
  @ApiProperty({ description: 'Yeni kullanıcı adı (3-32; harf, rakam, alt çizgi)' })
  @IsString()
  @MinLength(3, { message: 'Kullanıcı adı en az 3 karakter olmalıdır.' })
  @MaxLength(32, { message: 'Kullanıcı adı en fazla 32 karakter olabilir.' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Kullanıcı adı yalnızca harf, rakam ve alt çizgi içerebilir.' })
  newUsername: string;
}

// Re-auth (mevcut şifre + opsiyonel TOTP) ile birleşik — R7: kimlik değişimi şifre ister.
export class ChangeUsernameDto extends IntersectionType(ReauthFieldsDto, NewUsernameField) {}
