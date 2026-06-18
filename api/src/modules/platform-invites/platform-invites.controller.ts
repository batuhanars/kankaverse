import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformInvitesService } from './platform-invites.service';
import { CreatePlatformInviteDto } from './dto/platform-invite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type AuthUser = { id: string };

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin/platform-invites')
export class PlatformInvitesController {
  constructor(private service: PlatformInvitesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Admin] Platform davet kodu oluştur' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePlatformInviteDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '[Admin] Tüm platform davetlerini listele' })
  findAll() {
    return this.service.findAll();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Platform davetini iptal et (soft-disable)' })
  disable(@Param('id') id: string) {
    return this.service.disable(id);
  }
}
