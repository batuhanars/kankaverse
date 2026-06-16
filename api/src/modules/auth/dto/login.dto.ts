import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  // Kullanıcı adı VEYA e-posta ile giriş — tek alan. E-posta formatı zorunlu DEĞİL
  // (kullanıcı adı da geçerli). Lookup auth.service'te (e-posta mı kullanıcı adı mı ayrımı orada).
  @ApiProperty({ example: 'batuhan@example.com', description: 'Kullanıcı adı veya e-posta' })
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  identifier: string;

  @ApiProperty({ example: 'gizliSifre123' })
  @IsString()
  @MinLength(1)
  password: string;
}
