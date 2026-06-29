import { Controller, Post, Patch, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmergencyService } from './emergency.service';
import { TriggerEmergencyDto } from './dto/trigger-emergency.dto';
import { EmergencyStatementDto } from './dto/emergency-statement.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * A4 — Acil Yardım / Panik. Her giriş-yapmış kullanıcı tetikleyebilir (JwtAuthGuard).
 * Throttle: 5/dk → spam/yanlış-tetik seli sınırlı ama gerçek acil boğulmaz (global APP_GUARD ThrottlerGuard).
 */
@ApiTags('emergency')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('emergency')
export class EmergencyController {
  constructor(private emergencyService: EmergencyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Acil yardım tetikle — anında-çek + platform eskalasyon (metadata-only)' })
  trigger(@CurrentUser() user: { id: string }, @Body() dto: TriggerEmergencyDto) {
    return this.emergencyService.trigger(user.id, dto.channelId);
  }

  /** B1b — Mağdurun kendi acil raporuna gönüllü metin beyanı (yalnız kendi EMERGENCY raporu). */
  @Patch(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Acil rapora gönüllü beyan ekle (mağdurun kendi raporu, metin)' })
  addStatement(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: EmergencyStatementDto,
  ) {
    return this.emergencyService.addStatement(user.id, id, dto.description);
  }
}
