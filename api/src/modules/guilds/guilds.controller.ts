import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GuildsService } from './guilds.service';
import { CreateGuildDto } from './dto/create-guild.dto';
import { UpdateGuildDto } from './dto/update-guild.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('guilds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guilds')
export class GuildsController {
  constructor(private guildsService: GuildsService) {}

  @Post()
  @UseGuards(VerifiedEmailGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni sunucu oluştur (guild + owner member + #genel-sohbet); e-posta doğrulanmış gerekir' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateGuildDto) {
    return this.guildsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Üye olunan sunucuları listele' })
  findMyGuilds(@CurrentUser() user: { id: string }) {
    return this.guildsService.findMyGuilds(user.id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Ortam üye listesini getir (yalnız üyeler görebilir); rol önceliği OWNER>ADMIN>MEMBER, sonra username' })
  getMembers(@CurrentUser() user: { id: string }, @Param('id') guildId: string) {
    return this.guildsService.getMembers(user.id, guildId);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ortam ayarlarını güncelle: ad ve/veya adultsOnly (yalnız OWNER)' })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: UpdateGuildDto,
  ) {
    return this.guildsService.update(user.id, guildId, dto);
  }
}
