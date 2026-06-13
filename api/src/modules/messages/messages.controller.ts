import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './gateway/messages.gateway';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { AddReactionDto } from './dto/add-reaction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('channels/:id/messages')
export class MessagesController {
  constructor(
    private messagesService: MessagesService,
    private messagesGateway: MessagesGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mesaj geçmişi (cursor tabanlı, 50 limit)' })
  @ApiQuery({ name: 'before', required: false })
  findMessages(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Query('before') before?: string,
  ) {
    return this.messagesService.findMessages(user.id, channelId, before);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Mesaj gönder (WS broadcast tetikler)' })
  async sendMessage(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Body() dto: CreateMessageDto,
  ) {
    const message = await this.messagesService.create(user.id, channelId, dto);
    this.messagesGateway.broadcastMessage(channelId, message);
    await this.messagesGateway.notifyDmActivity(channelId, message);
    await this.messagesGateway.notifyChannelActivity(channelId, message);
    await this.messagesGateway.notifyMentions(channelId, message);
    return message;
  }

  @Patch(':messageId')
  @ApiOperation({ summary: 'Mesajı düzenle — yalnız yazar (WS message.updated yayar)' })
  async editMessage(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    const message = await this.messagesService.editMessage(user.id, channelId, messageId, dto);
    this.messagesGateway.broadcastMessageUpdate(channelId, message);
    return message;
  }

  @Delete(':messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mesajı sil (soft-delete) — yalnız yazar (WS message.deleted yayar)' })
  async deleteMessage(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Param('messageId') messageId: string,
  ) {
    await this.messagesService.deleteMessage(user.id, channelId, messageId);
    this.messagesGateway.broadcastMessageDelete(channelId, { messageId, channelId });
    return null;
  }

  @Post(':messageId/reactions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Mesaja emoji reaksiyonu ekle (idempotent)' })
  async addReaction(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Param('messageId') messageId: string,
    @Body() dto: AddReactionDto,
  ) {
    await this.messagesService.addReaction(user.id, channelId, messageId, dto.emoji);
    this.messagesGateway.broadcastReaction(channelId, 'reaction.added', {
      messageId,
      channelId,
      emoji: dto.emoji,
      userId: user.id,
    });
    return null;
  }

  @Delete(':messageId/reactions/:emoji')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mesajdan emoji reaksiyonunu kaldır (yoksa no-op)' })
  async removeReaction(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    await this.messagesService.removeReaction(user.id, channelId, messageId, emoji);
    this.messagesGateway.broadcastReaction(channelId, 'reaction.removed', {
      messageId,
      channelId,
      emoji,
      userId: user.id,
    });
    return null;
  }

  @Post(':messageId/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mesajı sabitle (idempotent); guild=admin, DM=üye' })
  async pinMessage(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Param('messageId') messageId: string,
  ) {
    await this.messagesService.pinMessage(user.id, channelId, messageId);
    this.messagesGateway.broadcastPin(channelId, 'message.pinned', {
      messageId,
      channelId,
      pinnedAt: new Date().toISOString(),
    });
    return null;
  }

  @Delete(':messageId/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mesaj sabitlemesini kaldır (idempotent)' })
  async unpinMessage(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Param('messageId') messageId: string,
  ) {
    await this.messagesService.unpinMessage(user.id, channelId, messageId);
    this.messagesGateway.broadcastPin(channelId, 'message.unpinned', {
      messageId,
      channelId,
    });
    return null;
  }
}

// Sabitlenen mesajlar listesi — /channels/:id/pins ayrı prefix; aynı modülde ikinci controller.
@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('channels/:id')
export class PinsController {
  constructor(
    private messagesService: MessagesService,
  ) {}

  @Get('pins')
  @ApiOperation({ summary: 'Kanaldaki sabitlenmiş mesajlar listesi (pinnedAt desc)' })
  findPins(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
  ) {
    return this.messagesService.findPins(user.id, channelId);
  }
}
