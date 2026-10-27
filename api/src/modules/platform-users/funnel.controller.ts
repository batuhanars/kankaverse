import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FunnelService } from './funnel.service';
import { FunnelDto } from './dto/funnel.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin/funnel')
export class FunnelController {
  constructor(private service: FunnelService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Kayıt huni sayıları (yalnız toplamlar)' })
  @ApiQuery({ name: 'cohortDays', required: false, enum: [0, 30, 90], description: '0 veya yok = tümü' })
  getFunnel(@Query('cohortDays') cohortDays?: string): Promise<FunnelDto> {
    return this.service.getFunnel(this.service.parseCohortDays(cohortDays));
  }
}
