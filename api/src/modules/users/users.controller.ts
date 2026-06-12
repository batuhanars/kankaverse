import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get(':id/card')
  @ApiOperation({ summary: 'Kullanıcı detay kartı (ortak ortam veya ilişki zorunlu, aksi hâlde 404)' })
  getUserCard(@CurrentUser() user: { id: string }, @Param('id') targetId: string) {
    return this.usersService.getUserCard(user.id, targetId);
  }
}
