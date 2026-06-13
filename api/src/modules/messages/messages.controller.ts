import {
  Controller,
  Post,
  Get,
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
    return message;
  }
}
