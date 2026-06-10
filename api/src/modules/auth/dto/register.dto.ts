import { IsEmail, IsString, MinLength, MaxLength, Matches, IsISO8601 } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'batuhan_42' })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Kullanıcı adı yalnızca harf, rakam ve alt çizgi içerebilir.' })
  username: string;

  @ApiProperty({ example: 'batuhan@example.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz.' })
  email: string;

  @ApiProperty({ example: 'gizliSifre123' })
  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır.' })
  @MaxLength(128, { message: 'Şifre en fazla 128 karakter olabilir.' })
  password: string;

  @ApiProperty({ example: '2000-05-15', description: 'ISO 8601 tarih (YYYY-MM-DD)' })
  @IsISO8601({}, { message: 'Doğum tarihi geçerli bir ISO tarih formatında olmalıdır.' })
  birthDate: string;
}
