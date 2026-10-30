import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

/** C35 §4 — yönetim uçları. Hepsi JwtAuthGuard + ortam bazında MANAGE_WEBHOOKS (serviste sınanır). */
@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guilds/:guildId/webhooks')
export class WebhooksController {
  constructor(private webhooks: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'Ortamın webhook listesi (token/özet ASLA dönmez)' })
  list(@CurrentUser() user: { id: string }, @Param('guildId') guildId: string) {
    return this.webhooks.list(user.id, guildId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Webhook oluştur (adres/token yalnız bu cevapta görünür)' })
  create(
    @CurrentUser() user: { id: string },
    @Param('guildId') guildId: string,
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooks.create(user.id, guildId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Webhook adını / kanalını değiştir (aynı ortam içinde)' })
  update(
    @CurrentUser() user: { id: string },
    @Param('guildId') guildId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhooks.update(user.id, guildId, id, dto);
  }

  @Post(':id/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Token yenile: eski adres anında geçersiz, sahiplik çağırana devredilir',
  })
  resetToken(
    @CurrentUser() user: { id: string },
    @Param('guildId') guildId: string,
    @Param('id') id: string,
  ) {
    return this.webhooks.resetToken(user.id, guildId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook sil (yumuşak; gönderilmiş mesajlar kalır)' })
  remove(
    @CurrentUser() user: { id: string },
    @Param('guildId') guildId: string,
    @Param('id') id: string,
  ) {
    return this.webhooks.remove(user.id, guildId, id);
  }
}
