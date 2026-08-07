import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../types/request-user';

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user?.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'Sunucu oluşturmak için e-postanı doğrulamalısın.',
        error: 'EMAIL_NOT_VERIFIED',
      });
    }
    return true;
  }
}
