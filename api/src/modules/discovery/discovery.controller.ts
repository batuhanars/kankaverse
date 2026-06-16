import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';
import { ListDiscoveryQueryDto } from './dto/list-discovery-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('discovery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('discovery')
export class DiscoveryController {
  constructor(private discoveryService: DiscoveryService) {}

  @Get('guilds')
  @ApiOperation({
    summary: 'Keşfet: discoverable ortamlar (arama/etiket/imleç). adultsOnly minör görüntüleyiciye süzülür.',
  })
  listGuilds(@CurrentUser() user: { id: string }, @Query() query: ListDiscoveryQueryDto) {
    return this.discoveryService.listGuilds(user.id, query);
  }

  @Get('tags')
  @ApiOperation({ summary: 'Keşfet: popüler etiketler (discoverable ortamlardan agregat, azalan).' })
  popularTags() {
    return this.discoveryService.popularTags();
  }
}
