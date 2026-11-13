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
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './gateway/messages.gateway';
import { ReactionNotifierService } from './reaction-notifier.service';
import { AudioNormalizeService } from '../../shared/media/audio-normalize.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { AddReactionDto } from './dto/add-reaction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('channels/:id/messages')
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(
    private messagesService: MessagesService,
    private messagesGateway: MessagesGateway,
    private audioNormalize: AudioNormalizeService,
    private reactionNotifier: ReactionNotifierService,
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

  // Statik '/search' segmenti — ':messageId' parametreli route'lardan ÖNCE tanımlanmalı
  // (NestJS statik segmentleri önce eşleştirir; bu konumlama garanti eder.)
  @Get('search')
  @ApiOperation({ summary: 'Kanal içi mesaj arama (case-insensitive, max 50 sonuç)' })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Arama sorgusu (min 2, max 100 karakter). `has` verilmezse ZORUNLU.',
  })
  @ApiQuery({ name: 'before', required: false, description: "Cursor: bu mesaj ID'sinden öncesi" })
  @ApiQuery({
    name: 'has',
    required: false,
    description:
      'İçerik türü: link | image | file (image=image/*|video/* eki, file=medya-dışı ek). Doluysa `q` opsiyonel.',
  })
  searchMessages(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Query('q') q: string,
    @Query('before') before?: string,
    @Query('has') has?: string,
  ) {
    return this.messagesService.searchMessages(user.id, channelId, q ?? '', before, has);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Mesaj gönder (WS broadcast tetikler)' })
  async sendMessage(
    @CurrentUser() user: RequestUser,
    @Param('id') channelId: string,
    @Body() dto: CreateMessageDto,
  ) {
    const message = await this.messagesService.create(user.id, channelId, dto, user.tokenFamily);
    this.messagesGateway.broadcastMessage(channelId, message);
    // C29: bildirimler gönderenin cevabını bekletmez; hata yutulmaz, loglanır.
    void this.notifyAfterSend(channelId, message).catch((err: unknown) =>
      this.logger.error(`Gönderim sonrası bildirim hatası (kanal ${channelId})`, err),
    );
    // C32: sesli mesaj ses seviyesi eşitleme arka planda (kuyruk, eşzamanlılık 1); cevabı bekletmez.
    this.audioNormalize.enqueueFromMessage(message);
    return message;
  }

  /** Davranış değişmez (kim ne bildirim alır): üçü eskisi gibi sırayla çalışır, yalnız arka planda. */
  private async notifyAfterSend(
    channelId: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    await this.messagesGateway.notifyDmActivity(channelId, message);
    await this.messagesGateway.notifyChannelActivity(channelId, message);
    await this.messagesGateway.notifyMentions(channelId, message);
  }

  @Patch(':messageId')
  @ApiOperation({ summary: 'Mesajı düzenle — yalnız yazar (WS message.updated yayar)' })
  async editMessage(
    @CurrentUser() user: RequestUser,
    @Param('id') channelId: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    const message = await this.messagesService.editMessage(
      user.id,
      channelId,
      messageId,
      dto,
      user.tokenFamily,
    );
    await this.messagesGateway.broadcastMessageUpdate(channelId, message);
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

  @Get(':messageId/reactions')
  @ApiOperation({
    summary: 'Mesaja tepki bırakanlar: emoji gruplarına göre kişi listesi (en fazla 200 satır)',
  })
  listReactions(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.listReactions(user.id, channelId, messageId);
  }

  @Post(':messageId/reactions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Mesaja emoji tepkisi bırak (kişi başı TEK tepki: farklı emoji eskisinin yerine geçer)',
  })
  async addReaction(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Param('messageId') messageId: string,
    @Body() dto: AddReactionDto,
  ) {
    const { removed, added } = await this.messagesService.addReaction(
      user.id,
      channelId,
      messageId,
      dto.emoji,
    );
    // Durum değişmediyse yayın yok. Değiştirmede sıra: önce eskinin kalkışı, sonra yenisi
    // (eski istemciler kaldır+ekle çiftini doğru sayar).
    if (removed)
      this.messagesGateway.broadcastReaction(channelId, 'reaction.removed', {
        messageId,
        channelId,
        emoji: removed,
        userId: user.id,
      });
    if (added) {
      this.messagesGateway.broadcastReaction(channelId, 'reaction.added', {
        messageId,
        channelId,
        emoji: added,
        userId: user.id,
      });
      // C46 §4: bildirim tepki isteğini bekletmez ve ASLA düşürmez; hata yutulmaz, loglanır.
      void this.reactionNotifier
        .notifyAdded(user.id, channelId, messageId, added)
        .catch((err: unknown) =>
          this.logger.error(`Tepki bildirimi hatası (mesaj ${messageId})`, err),
        );
    }
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
    const changed = await this.messagesService.removeReaction(user.id, channelId, messageId, emoji);
    // Durum değişmediyse yayın yok: istemciler sayacı delta ile günceller, boş yayın sayacı bozar
    if (changed) {
      this.messagesGateway.broadcastReaction(channelId, 'reaction.removed', {
        messageId,
        channelId,
        emoji,
        userId: user.id,
      });
      // C46 §4b.3: DM liste göstergesini temizle; fire-and-forget, hata yutulmaz loglanır.
      void this.reactionNotifier
        .notifyRemoved(user.id, channelId, messageId, emoji)
        .catch((err: unknown) =>
          this.logger.error(`Tepki göstergesi temizleme hatası (mesaj ${messageId})`, err),
        );
    }
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
  constructor(private messagesService: MessagesService) {}

  @Get('pins')
  @ApiOperation({ summary: 'Kanaldaki sabitlenmiş mesajlar listesi (pinnedAt desc)' })
  findPins(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.messagesService.findPins(user.id, channelId);
  }
}

/**
 * Sunucu-geneli mesaj arama — guild-scoped route.
 * GET /guilds/:id/messages/search?q= → erişilebilir kanallarda, kanal-gruplu.
 */
@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guilds/:id/messages')
export class GuildSearchController {
  constructor(private messagesService: MessagesService) {}

  @Get('search')
  @ApiOperation({ summary: 'Sunucu-geneli mesaj arama (erişilebilir kanallarda, kanal-gruplu)' })
  @ApiQuery({ name: 'q', required: false, description: 'Arama sorgusu (min 2, max 100 karakter)' })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Yazar (authorId) — yalnız o kullanıcının mesajları',
  })
  @ApiQuery({
    name: 'mentions',
    required: false,
    description: 'Bahsedilen (userId) — o kullanıcıyı @bahseden mesajlar',
  })
  @ApiQuery({
    name: 'in',
    required: false,
    description: 'Kanal (channelId) — yalnız o kanalda gönderilenler',
  })
  @ApiQuery({
    name: 'has',
    required: false,
    description: 'İçerik türü: link | image | file (image=image/*|video/* eki, file=medya-dışı ek)',
  })
  searchGuild(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('mentions') mentions?: string,
    @Query('in') inChannel?: string,
    @Query('has') has?: string,
  ) {
    return this.messagesService.searchGuildMessages(user.id, guildId, q ?? '', {
      from,
      mentions,
      in: inChannel,
      has,
    });
  }
}
