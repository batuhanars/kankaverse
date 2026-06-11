import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as { emailVerifiedAt?: Date | null };
    if (!user?.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'Sunucu oluşturmak için e-postanı doğrulamalısın.',
        error: 'EMAIL_NOT_VERIFIED',
      });
    }
    return true;
  }
}
