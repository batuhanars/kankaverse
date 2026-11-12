import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SharedModule } from '../../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { E2eeEnabledGuard } from './e2ee-enabled.guard';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2eeTransferEnabledGuard } from './e2ee-transfer-enabled.guard';
import { E2eeTransferController } from './e2ee-transfer.controller';
import { E2eeTransferJob } from './e2ee-transfer.job';
import { E2eeTransferService } from './e2ee-transfer.service';
import { UserThrottlerGuard } from './user-throttler.guard';

/** E5b cihazdan cihaza aktarım uçları. Yedek modülü gibi E2eeModule'den ayrı (bağımlılık döngüsü yok). */
@Module({
  imports: [
    SharedModule,
    NotificationsModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  ],
  controllers: [E2eeTransferController],
  providers: [
    E2eeFlagService,
    E2eeEnabledGuard,
    E2eeTransferEnabledGuard,
    UserThrottlerGuard,
    E2eeTransferService,
    E2eeTransferJob,
  ],
})
export class E2eeTransferModule {}
