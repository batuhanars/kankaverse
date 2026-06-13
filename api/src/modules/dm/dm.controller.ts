import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DmService } from './dm.service';
import { CreateDmChannelDto } from './dto/create-dm-channel.dto';
import { CreateGroupDmDto } from './dto/create-group-dm.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { RenameGroupDmDto } from './dto/rename-group-dm.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('dm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dm')
export class DmController {
  constructor(private dmService: DmService) {}

  @Get('channels')
  @ApiOperation({ summary: 'DM kanalları — 1-1 + GROUP_DM (son mesaj + unread). G4: temizlenmiş kanallar filtrelenir.' })
  getDmChannels(@CurrentUser() user: { id: string }) {
    return this.dmService.getDmChannels(user.id);
  }

  @Post('channels')
  @Throttle({ default: { ttl: 3600000, limit: 30 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'DM kanalı aç (canDm kontrolü); mevcut kanal varsa döndür' })
  createDmChannel(@CurrentUser() user: { id: string }, @Body() dto: CreateDmChannelDto) {
    return this.dmService.getOrCreateDmChannel(user.id, dto);
  }

  @Delete('channels/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'G4 inbox soft-delete: DM kaydı çağıranın listesinden temizlenir, mesajlar DB\'de durur' })
  clearChannel(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.dmService.clearDmChannel(user.id, channelId);
  }

  @Post('channels/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'DM kanalını okundu işaretle (lastReadAt = now)' })
  markRead(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.dmService.markRead(user.id, channelId);
  }

  // ─── Grup DM ───────────────────────────────────────────────────────────────

  @Post('groups')
  @Throttle({ default: { ttl: 3600000, limit: 10 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[R7] Grup DM oluştur — yetişkin-only + arkadaş-tabanlı' })
  createGroupDm(@CurrentUser() user: { id: string }, @Body() dto: CreateGroupDmDto) {
    return this.dmService.createGroupDm(user.id, dto);
  }

  @Post('groups/:id/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[R7] Gruba üye ekle — ekleyenin arkadaşı + yetişkin' })
  addGroupMember(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.dmService.addGroupMember(user.id, groupId, dto);
  }

  @Delete('groups/:id/members/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gruptan ayrıl; üye < 2 kalırsa kanal soft-delete' })
  leaveGroupDm(@CurrentUser() user: { id: string }, @Param('id') groupId: string) {
    return this.dmService.leaveGroupDm(user.id, groupId);
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grubu sil — yalnız owner' })
  deleteGroupDm(@CurrentUser() user: { id: string }, @Param('id') groupId: string) {
    return this.dmService.deleteGroupDm(user.id, groupId);
  }

  @Patch('groups/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grup adını güncelle — yalnız owner' })
  renameGroupDm(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Body() dto: RenameGroupDmDto,
  ) {
    return this.dmService.renameGroupDm(user.id, groupId, dto);
  }
}
