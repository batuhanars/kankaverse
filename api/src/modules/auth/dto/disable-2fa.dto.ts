import { IntersectionType } from '@nestjs/swagger';
import { ReauthFieldsDto } from './reauth-fields.dto';

// 2FA kapatma: şifre + mevcut TOTP kodu zorunlu
export class Disable2faDto extends IntersectionType(ReauthFieldsDto) {}
