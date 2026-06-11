import { IntersectionType } from '@nestjs/swagger';
import { ReauthFieldsDto } from './reauth-fields.dto';

// Hesap silme talebi: şifre + 2FA (varsa) zorunlu
export class DeleteAccountDto extends IntersectionType(ReauthFieldsDto) {}
