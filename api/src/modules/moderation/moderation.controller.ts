import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ModerationModuleService } from './moderation.service';
import { CreateActionDto } from './dto/create-action.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModeratorGuard } from '../../common/guards/moderator.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('moderation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModeratorGuard)
@Controller()
export class ModerationController {
  constructor(private moderationService: ModerationModuleService) {}

  /** GET /moderation/queue — öncelikli moderasyon kuyruğu (OPEN+TRIAGED) */
  @Get('moderation/queue')
  @ApiOperation({ summary: 'Moderasyon kuyruğu (öncelik desc, tarih asc)' })
  getQueue() {
    return this.moderationService.getQueue();
  }

  /** POST /moderation/actions — aksiyon uygula + AuditLog yaz */
  @Post('moderation/actions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Moderasyon aksiyonu (WARN/MUTE/KICK/BAN/CONTENT_REMOVE/SHADOW_LIMIT)' })
  createAction(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateActionDto,
  ) {
    return this.moderationService.createAction(user.id, dto);
  }

  /** GET /audit — moderasyon eylem geçmişi (yeni→eski) */
  @Get('audit')
  @ApiOperation({ summary: 'Audit log (moderasyon eylem geçmişi)' })
  getAuditLog() {
    return this.moderationService.getAuditLog();
  }
}
