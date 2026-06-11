import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Kayıtlı e-posta adresi' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  email: string;
}
