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
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IntegrationsService, LinkResult } from './integrations.service';
import { StreamAnnounceConfigService } from './stream-announce-config.service';
import { UpdateIntegrationDto } from './dto/integration.dto';

/** C36 §2 — hesap bağlama uçları. Geri dönüş ucu kimliksiz (kimlik state'ten gelir). */
@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private integrations: IntegrationsService,
    private announceConfig: StreamAnnounceConfigService,
    private config: ConfigService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bağlı dış hesaplarım' })
  list(@CurrentUser() user: { id: string }) {
    return this.integrations.list(user.id);
  }

  // Statik yollar `:provider` yollarından önce
  @Get('providers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hangi sağlayıcıların açık olduğu (UI gating)' })
  providers() {
    return this.integrations.providerFlags();
  }

  @Get('announce-guilds')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Üyesi olduğum, yayın duyurusu açık ortamlar + opt-in durumum' })
  announceGuilds(@CurrentUser() user: { id: string }) {
    return this.announceConfig.announceGuilds(user.id);
  }

  @Post(':provider/link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OAuth bağlama adresi üret (minör 403, zaten bağlıysa 409)' })
  link(@CurrentUser() user: { id: string }, @Param('provider') provider: string) {
    return this.integrations.startLink(user.id, provider);
  }

  @Get(':provider/callback')
  @ApiOperation({ summary: 'OAuth geri dönüşü (tarayıcı yönlendirmesi, kimliksiz)' })
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    let result: LinkResult = 'error';
    try {
      result = await this.integrations.completeLink(
        provider,
        typeof code === 'string' ? code : undefined,
        typeof state === 'string' ? state : undefined,
      );
    } catch (err) {
      // Bilinmeyen/kapalı sağlayıcı: 404 (envelope). Diğer beklenmeyen hatalar kullanıcıya hata bandı.
      if ((err as { status?: number }).status === 404) throw err;
    }
    const base = (this.config.get<string>('frontendUrl') ?? 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    const query = new URLSearchParams({ link: result, provider });
    res.redirect(302, `${base}/settings/connections?${query.toString()}`);
  }

  @Patch(':provider')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profilimde göster anahtarı' })
  update(
    @CurrentUser() user: { id: string },
    @Param('provider') provider: string,
    @Body() dto: UpdateIntegrationDto,
  ) {
    return this.integrations.setShowOnProfile(user.id, provider, dto.showOnProfile);
  }

  @Delete(':provider')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bağlantıyı kopar (hesap + abonelik silinir)' })
  unlink(@CurrentUser() user: { id: string }, @Param('provider') provider: string) {
    return this.integrations.unlink(user.id, provider);
  }
}
