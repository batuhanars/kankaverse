import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { AiVideoBalanceService } from './ai-video-balance.service';

/** C45 — Pika bakiyesi; yalnız platform admini (grants ile aynı kapı). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin/ai-video/balance')
export class AiVideoBalanceController {
  constructor(private service: AiVideoBalanceService) {}

  @Get()
  @ApiOperation({
    summary: '[Admin] Pika bakiyesi (USD + kredi) ve verilmiş ama harcanmamış kredi',
  })
  get() {
    return this.service.get();
  }
}
