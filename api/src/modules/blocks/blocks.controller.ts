import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BlocksService } from './blocks.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('blocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('blocks')
export class BlocksController {
  constructor(private blocksService: BlocksService) {}

  @Get()
  @ApiOperation({ summary: 'Engellenen kullanıcı listesi' })
  getBlocks(@CurrentUser() user: { id: string }) {
    return this.blocksService.getBlocks(user.id);
  }

  @Post()
  @Throttle({ default: { ttl: 3600000, limit: 30 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Kullanıcıyı engelle (arkadaşlık sil + bekleyen istekler iptal)' })
  blockUser(@CurrentUser() user: { id: string }, @Body() dto: CreateBlockDto) {
    return this.blocksService.blockUser(user.id, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Engeli kaldır' })
  unblock(@CurrentUser() user: { id: string }, @Param('userId') targetUserId: string) {
    return this.blocksService.unblockUser(user.id, targetUserId);
  }
}
