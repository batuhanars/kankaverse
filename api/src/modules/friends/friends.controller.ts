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
import { FriendsService } from './friends.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { SendFriendRequestByUserDto } from './dto/send-friend-request-by-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('friends')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private friendsService: FriendsService) {}

  @Get()
  @ApiOperation({ summary: 'Arkadaş listesi (ACCEPTED)' })
  getFriends(@CurrentUser() user: { id: string }) {
    return this.friendsService.getFriends(user.id);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Bekleyen arkadaşlık istekleri (incoming + outgoing)' })
  getRequests(@CurrentUser() user: { id: string }) {
    return this.friendsService.getFriendRequests(user.id);
  }

  @Post('requests')
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Arkadaş kodu ile istek gönder (CODE yolu, minör dahil açık)' })
  sendRequest(@CurrentUser() user: { id: string }, @Body() dto: SendFriendRequestDto) {
    return this.friendsService.sendFriendRequest(user.id, dto);
  }

  @Post('requests/by-user')
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Kullanıcı ID ile istek gönder (USER_CLICK, G2 tıkla-ekle) — ortak ortam + yetişkin zorunlu' })
  sendRequestByUser(@CurrentUser() user: { id: string }, @Body() dto: SendFriendRequestByUserDto) {
    return this.friendsService.sendFriendRequestByUser(user.id, dto);
  }

  @Post('requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arkadaşlık isteğini kabul et (yalnız addressee)' })
  acceptRequest(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.friendsService.acceptFriendRequest(user.id, id);
  }

  @Post('requests/:id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arkadaşlık isteğini reddet (yalnız addressee)' })
  declineRequest(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.friendsService.declineFriendRequest(user.id, id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arkadaşlığı sil' })
  removeFriend(@CurrentUser() user: { id: string }, @Param('userId') targetUserId: string) {
    return this.friendsService.removeFriend(user.id, targetUserId);
  }
}
