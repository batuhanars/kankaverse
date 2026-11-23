import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/types/request-user';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2EE_ERRORS } from './e2ee.util';

/**
 * E7: kimlik yazma uçlarının kapısı (E2eeEnabledGuard'dan SONRA). `E2EE_IDENTITY` kapalıyken ya da kullanıcı
 * ilk aşama izin listesinde değilken uçlar, E1'deki kapalı-uç davranışıyla aynı: 404 E2EE_DISABLED.
 */
@Injectable()
export class E2eeIdentityEnabledGuard implements CanActivate {
  constructor(private flag: E2eeFlagService) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !this.flag.isIdentityEligible(user.id)) throw E2EE_ERRORS.disabled();
    return true;
  }
}
