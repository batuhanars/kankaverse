import { IntersectionType } from '@nestjs/swagger';
import { ReauthFieldsDto } from './reauth-fields.dto';

// Setup 2FA: yalnız reauth gerekir (body = currentPassword + totpCode?)
export class Setup2faDto extends IntersectionType(ReauthFieldsDto) {}
