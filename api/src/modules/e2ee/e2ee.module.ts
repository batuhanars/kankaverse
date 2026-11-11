import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SharedModule } from '../../shared/shared.module';
import { E2eeChannelService } from './e2ee-channel.service';
import { E2eeClaimService } from './e2ee-claim.service';
import { E2eeDevicesService } from './e2ee-devices.service';
import { E2eeExistsService } from './e2ee-exists.service';
import { E2eeEnabledGuard } from './e2ee-enabled.guard';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2eeGroupsService } from './e2ee-groups.service';
import { E2eeMessageService } from './e2ee-message.service';
import { E2eeNotifyService } from './e2ee-notify.service';
import { E2eeRevocationService } from './e2ee-revocation.service';
import { E2eeController } from './e2ee.controller';
import { UserThrottlerGuard } from './user-throttler.guard';

/** E1 — DM uçtan uca şifreleme sunucu tarafı (anahtar dağıtımı + epoch sırası). İçerik açılmaz. */
@Module({
  // Claim hız sınırı (kullanıcı başı 30/dk) kendi in-memory depolamasıyla; global IP sınırından bağımsız.
  imports: [SharedModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
  controllers: [E2eeController],
  providers: [
    E2eeFlagService,
    E2eeEnabledGuard,
    UserThrottlerGuard,
    E2eeNotifyService,
    E2eeDevicesService,
    E2eeChannelService,
    E2eeClaimService,
    E2eeGroupsService,
    E2eeMessageService,
    E2eeExistsService,
    E2eeRevocationService,
  ],
  exports: [E2eeMessageService, E2eeRevocationService],
})
export class E2eeModule {}
