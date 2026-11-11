import {
  Body,
  Controller,
  Delete,
  Get,
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
  DeleteBackupDto,
  PutBackupKeyDto,
  ResetBackupDto,
  SnapshotRefDto,
} from './dto/e2ee-backup.dto';
import { E2eeBackupEnabledGuard } from './e2ee-backup-enabled.guard';
import { E2eeBackupService } from './e2ee-backup.service';
import { E2eeEnabledGuard } from './e2ee-enabled.guard';
import { UserThrottlerGuard } from './user-throttler.guard';

/** E5a şifreli DM yedeği. Hepsi: JWT + E2EE uygunluğu + yedek bayrağı + kullanıcı başı hız sınırı. */
@ApiTags('e2ee')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, E2eeEnabledGuard, E2eeBackupEnabledGuard, UserThrottlerGuard)
@Controller('e2ee/backup')
export class E2eeBackupController {
  constructor(private backup: E2eeBackupService) {}

  @Get()
  @ApiOperation({ summary: 'Yedek durumu: tuz, parametre, sarılmış anahtar, görüntü listesi' })
  get(@CurrentUser() user: RequestUser) {
    return this.backup.get(user.id);
  }

  @Put('key')
  @ApiOperation({
    summary: 'Yedek anahtarı kur (keyVersion=1) ya da şifre değiştir (aynı keyVersion)',
  })
  putKey(@CurrentUser() user: RequestUser, @Body() dto: PutBackupKeyDto) {
    return this.backup.putKey(user.id, dto);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({
    summary: 'Yedeği sıfırla (reauth): keyVersion+1, tüm görüntüler silinir (5/saat)',
  })
  reset(@CurrentUser() user: RequestUser, @Body() dto: ResetBackupDto) {
    return this.backup.reset(user.id, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Yedeği kapat (reauth): anahtar kaydı + tüm görüntüler (5/saat)' })
  remove(@CurrentUser() user: RequestUser, @Body() dto: DeleteBackupDto) {
    return this.backup.remove(user.id, dto);
  }

  @Post('snapshot/presign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Şifreli görüntü için kısa ömürlü presigned PUT (≤25 MB)' })
  presign(@CurrentUser() user: RequestUser, @Body() dto: SnapshotRefDto) {
    return this.backup.presign(user.id, dto);
  }

  @Post('snapshot/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Yüklenen görüntüyü doğrula (HEAD) ve kaydet; cihaz başına tek, kullanıcı başına ≤5',
  })
  commit(@CurrentUser() user: RequestUser, @Body() dto: SnapshotRefDto) {
    return this.backup.commit(user.id, dto);
  }

  @Get('snapshot/:deviceId')
  @ApiOperation({
    summary: 'Kendi görüntüm için kısa ömürlü presigned GET (iptal edilmiş cihaz dahil)',
  })
  snapshot(@CurrentUser() user: RequestUser, @Param('deviceId') deviceId: string) {
    return this.backup.getSnapshot(user.id, deviceId);
  }
}
