import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReauthFieldsDto } from './reauth-fields.dto';
import { IntersectionType } from '@nestjs/swagger';

class NewEmailField {
  @ApiProperty({ description: 'Yeni e-posta adresi' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  newEmail: string;
}

export class ChangeEmailDto extends IntersectionType(ReauthFieldsDto, NewEmailField) {}
