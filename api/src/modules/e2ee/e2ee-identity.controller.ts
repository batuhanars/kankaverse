import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestUser } from '../../common/types/request-user';
import {
  PutBackupIdentityDto,
  PutIdentityDto,
  ResetIdentityDto,
  SignDeviceDto,
} from './dto/e2ee-identity.dto';
import { E2eeBackupEnabledGuard } from './e2ee-backup-enabled.guard';
import { E2eeEnabledGuard } from './e2ee-enabled.guard';
import { E2eeIdentityEnabledGuard } from './e2ee-identity-enabled.guard';
import { E2eeIdentityService } from './e2ee-identity.service';
import { UserThrottlerGuard } from './user-throttler.guard';

/** E7 kimlik yazma uçları. Okuma ayrı uç değil: kimlik, mevcut cihaz/kanal yanıtlarına eklenir (§3.2). */
@ApiTags('e2ee')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, E2eeEnabledGuard, E2eeIdentityEnabledGuard, UserThrottlerGuard)
@Controller('e2ee')
export class E2eeIdentityController {
  constructor(private identity: E2eeIdentityService) {}

  @Put('identity')
  @ApiOperation({
    summary: 'Güvenlik kimliğini kur (sürüm 1) + kendi cihazlarını imzala; varsa 409',
  })
  create(@CurrentUser() user: RequestUser, @Body() dto: PutIdentityDto) {
    return this.identity.create(user.id, dto);
  }

  @Post('identity/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({
    summary:
      'Güvenlik kimliğini sıfırla (reauth): sürüm+1, tüm imzalar ve yedekteki kimlik silinir (5/saat)',
  })
  reset(@CurrentUser() user: RequestUser, @Body() dto: ResetIdentityDto) {
    return this.identity.reset(user.id, dto);
  }

  @Post('devices/:deviceId/signature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kendi aktif cihazına kimlik imzası yaz (sürüm güncel olmalı)' })
  sign(
    @CurrentUser() user: RequestUser,
    @Param('deviceId') deviceId: string,
    @Body() dto: SignDeviceDto,
  ) {
    return this.identity.signDevice(user.id, deviceId, dto);
  }

  @Put('backup/identity')
  @UseGuards(E2eeBackupEnabledGuard)
  @ApiOperation({ summary: 'Kimlik özel anahtarını BMK ile sarılı olarak yedeğe yaz' })
  putBackupIdentity(@CurrentUser() user: RequestUser, @Body() dto: PutBackupIdentityDto) {
    return this.identity.putBackupIdentity(user.id, dto);
  }
}
