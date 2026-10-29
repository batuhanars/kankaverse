import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GamesService } from '../../shared/games/games.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('games')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('games')
export class GamesController {
  constructor(private games: GamesService) {}

  @Get('curated')
  @ApiOperation({ summary: 'Elle oyun listesi (masaüstü süreç eşlemesi için; 1 saat önbellek)' })
  curated() {
    return this.games.listCurated();
  }
}
