import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Enable2faDto {
  @ApiProperty({ description: 'Authenticator uygulamasından 6 haneli TOTP kodu' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
