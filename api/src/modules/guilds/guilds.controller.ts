import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GuildsService } from './guilds.service';
import { CreateGuildDto } from './dto/create-guild.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('guilds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guilds')
export class GuildsController {
  constructor(private guildsService: GuildsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni sunucu oluştur (guild + owner member + #genel-sohbet)' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateGuildDto) {
    return this.guildsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Üye olunan sunucuları listele' })
  findMyGuilds(@CurrentUser() user: { id: string }) {
    return this.guildsService.findMyGuilds(user.id);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Guild ID ile sunucuya katıl (Sprint 1 basitleştirmesi)' })
  join(@CurrentUser() user: { id: string }, @Param('id') guildId: string) {
    return this.guildsService.join(user.id, guildId);
  }
}
