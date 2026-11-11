import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SharedModule } from '../../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { E2eeBackupEnabledGuard } from './e2ee-backup-enabled.guard';
import { E2eeBackupController } from './e2ee-backup.controller';
import { E2eeBackupService } from './e2ee-backup.service';
import { E2eeEnabledGuard } from './e2ee-enabled.guard';
import { E2eeFlagService } from './e2ee-flag.service';
import { UserThrottlerGuard } from './user-throttler.guard';

/**
 * E5a yedek uçları. E2eeModule'den AYRI: reauth için AuthService gerekir, AuthModule zaten E2eeModule'ü
 * içe aktarıyor (iptal servisi); aynı modüle koymak döngü yaratırdı.
 */
@Module({
  imports: [SharedModule, AuthModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
  controllers: [E2eeBackupController],
  providers: [
    E2eeFlagService,
    E2eeEnabledGuard,
    E2eeBackupEnabledGuard,
    UserThrottlerGuard,
    E2eeBackupService,
  ],
})
export class E2eeBackupModule {}
