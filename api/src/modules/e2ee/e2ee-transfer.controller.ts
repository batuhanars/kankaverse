import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestUser } from '../../common/types/request-user';
import {
  AcceptTransferDto,
  CreateTransferDto,
  RevealTransferDto,
  TransferBlobDto,
} from './dto/e2ee-transfer.dto';
import { E2eeEnabledGuard } from './e2ee-enabled.guard';
import { E2eeTransferEnabledGuard } from './e2ee-transfer-enabled.guard';
import { E2eeTransferService } from './e2ee-transfer.service';
import { UserThrottlerGuard } from './user-throttler.guard';

/**
 * E5b cihazdan cihaza geçmiş aktarımı. Hepsi: JWT + E2EE uygunluğu + aktarım bayrağı + kullanıcı başı hız sınırı.
 * Çağıranın cihazı oturumdan çözülür (gövdede cihaz kimliği yok).
 */
@ApiTags('e2ee')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, E2eeEnabledGuard, E2eeTransferEnabledGuard, UserThrottlerGuard)
@Controller('e2ee/transfer')
export class E2eeTransferController {
  constructor(private transfer: E2eeTransferService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({
    summary: 'Yeni cihaz: aktarım isteği aç (yalnız taahhüt; açık eski istek iptal, 10/saat)',
  })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTransferDto) {
    return this.transfer.create(user, dto);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Eski cihaz: kullanıcının açık isteği (kendi açtığı hariç) ya da null' })
  pending(@CurrentUser() user: RequestUser) {
    return this.transfer.pending(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Durum + karşı tarafın açık malzemesi (soket kaçarsa yoklama)' })
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.transfer.get(user, id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eski cihaz: kabul + geçici açık anahtar' })
  accept(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AcceptTransferDto,
  ) {
    return this.transfer.accept(user, id, dto);
  }

  @Post(':id/reveal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yeni cihaz: taahhüdü aç (sunucu doğrular)' })
  reveal(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RevealTransferDto,
  ) {
    return this.transfer.reveal(user, id, dto);
  }

  @Post(':id/upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eski cihaz: şifreli yük için presigned PUT (≤25 MB)' })
  upload(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: TransferBlobDto) {
    return this.transfer.upload(user, id, dto);
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eski cihaz: yük yüklendi (boyut doğrulanır)' })
  commit(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: TransferBlobDto) {
    return this.transfer.commit(user, id, dto);
  }

  @Get(':id/blob')
  @ApiOperation({ summary: 'Yeni cihaz: şifreli yük için kısa ömürlü presigned GET' })
  blob(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.transfer.blob(user, id);
  }

  @Post(':id/done')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yeni cihaz: aldım; nesne silinir, tüm cihazlara güvenlik bildirimi' })
  done(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.transfer.done(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'İptal (iki taraf da; bekleyen isteği diğer cihaz da reddedebilir)' })
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.transfer.cancel(user, id);
  }
}
