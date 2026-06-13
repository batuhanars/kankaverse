import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('invites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class InvitesController {
  constructor(private invitesService: InvitesService) {}

  @Post('guilds/:id/invites')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Davet kodu oluştur (OWNER/ADMIN)' })
  createInvite(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invitesService.createInvite(user.id, guildId, dto);
  }

  @Get('guilds/:id/invites')
  @ApiOperation({ summary: 'Aktif davetleri listele (OWNER/ADMIN)' })
  listInvites(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
  ) {
    return this.invitesService.listInvites(user.id, guildId);
  }

  @Delete('invites/:code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Daveti iptal et (o ortamın OWNER/ADMIN\'i)' })
  revokeInvite(
    @CurrentUser() user: { id: string },
    @Param('code') code: string,
  ) {
    return this.invitesService.revokeInvite(user.id, code);
  }

  @Get('invites/:code')
  @ApiOperation({ summary: 'Davet önizleme (auth)' })
  previewInvite(
    @Param('code') code: string,
  ) {
    return this.invitesService.previewInvite(code);
  }

  @Post('invites/:code/join')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Davet kodu ile ortama katıl (auth) — [R7] adultsOnly kapısı' })
  joinByInvite(
    @CurrentUser() user: { id: string },
    @Param('code') code: string,
  ) {
    return this.invitesService.joinByInvite(user.id, code);
  }
}
