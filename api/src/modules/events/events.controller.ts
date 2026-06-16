import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post('guilds/:id/events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ortam etkinliği oluştur (MANAGE_EVENTS)' })
  create(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventsService.create(user.id, guildId, dto);
  }

  @Get('guilds/:id/events')
  @ApiOperation({ summary: 'Görünür etkinlikleri listele (üye + görünürlük, startAt artan)' })
  findByGuild(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
  ) {
    return this.eventsService.findByGuild(user.id, guildId);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Tek etkinlik (üye + görünürlük)' })
  findOne(
    @CurrentUser() user: { id: string },
    @Param('id') eventId: string,
  ) {
    return this.eventsService.findOne(user.id, eventId);
  }

  @Patch('events/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Etkinlik güncelle (MANAGE_EVENTS)' })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(user.id, eventId, dto);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Etkinliği soft-delete et (MANAGE_EVENTS). Dönüş null.' })
  remove(
    @CurrentUser() user: { id: string },
    @Param('id') eventId: string,
  ) {
    return this.eventsService.remove(user.id, eventId);
  }

  @Post('events/:id/interest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '"İlgileniyor" işaretle (üye + görünürlük; idempotent)' })
  addInterest(
    @CurrentUser() user: { id: string },
    @Param('id') eventId: string,
  ) {
    return this.eventsService.addInterest(user.id, eventId);
  }

  @Delete('events/:id/interest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'İlgiyi kaldır (üye; idempotent)' })
  removeInterest(
    @CurrentUser() user: { id: string },
    @Param('id') eventId: string,
  ) {
    return this.eventsService.removeInterest(user.id, eventId);
  }
}
