import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SharedModule } from '../../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { E2eeBackupEnabledGuard } from './e2ee-backup-enabled.guard';
import { E2eeEnabledGuard } from './e2ee-enabled.guard';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2eeIdentityEnabledGuard } from './e2ee-identity-enabled.guard';
import { E2eeIdentityController } from './e2ee-identity.controller';
import { E2eeIdentityService } from './e2ee-identity.service';
import { E2eeNotifyService } from './e2ee-notify.service';
import { UserThrottlerGuard } from './user-throttler.guard';

/**
 * E7 kimlik uçları. E5a yedek modülüyle aynı sebeple E2eeModule'den AYRI: reauth için AuthService gerekir,
 * AuthModule zaten E2eeModule'ü içe aktarıyor; aynı modüle koymak döngü yaratırdı.
 */
@Module({
  imports: [SharedModule, AuthModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
  controllers: [E2eeIdentityController],
  providers: [
    E2eeFlagService,
    E2eeEnabledGuard,
    E2eeBackupEnabledGuard,
    E2eeIdentityEnabledGuard,
    UserThrottlerGuard,
    E2eeNotifyService,
    E2eeIdentityService,
  ],
})
export class E2eeIdentityModule {}
