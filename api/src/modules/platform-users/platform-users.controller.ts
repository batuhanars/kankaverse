import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformUsersService } from './platform-users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin/users')
export class PlatformUsersController {
  constructor(private service: PlatformUsersService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Kayıtlı kullanıcıları listele (genel-bakış)' })
  findAll() {
    return this.service.findAll();
  }
}
