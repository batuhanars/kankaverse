import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/types/request-user';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2EE_ERRORS } from './e2ee.util';

/**
 * E5a: yedek uçlarının bayrak kapısı (E2eeEnabledGuard'dan SONRA). `E2EE_BACKUP` kapalıyken uçlar,
 * E1'deki kapalı-uç davranışıyla aynı: 404 E2EE_DISABLED.
 */
@Injectable()
export class E2eeBackupEnabledGuard implements CanActivate {
  constructor(private flag: E2eeFlagService) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !this.flag.backup || !this.flag.isEligible(user.id)) throw E2EE_ERRORS.disabled();
    return true;
  }
}
