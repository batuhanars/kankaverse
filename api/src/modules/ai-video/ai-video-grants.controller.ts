import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiVideoGrantsService } from './ai-video-grants.service';
import { UpsertAiVideoGrantDto } from './dto/ai-video-grant.dto';

/** C40 (R7) — yapay zeka video erişim hakları; yalnız platform admini. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin/ai-video/grants')
export class AiVideoGrantsController {
  constructor(private service: AiVideoGrantsService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Yapay zeka video erişim hakları' })
  list() {
    return this.service.list();
  }

  @Put(':userId')
  @ApiOperation({ summary: '[Admin] Erişim hakkı ver / yenile (yeni dönem)' })
  upsert(
    @CurrentUser() admin: { id: string },
    @Param('userId') userId: string,
    @Body() dto: UpsertAiVideoGrantDto,
  ) {
    return this.service.upsert(admin.id, userId, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Admin] Erişim hakkını iptal et (kayıt silinmez)' })
  revoke(@CurrentUser() admin: { id: string }, @Param('userId') userId: string) {
    return this.service.revoke(admin.id, userId);
  }
}
