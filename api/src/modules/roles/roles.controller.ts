import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ReorderRolesDto } from './dto/reorder-roles.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RolesController {
  constructor(private rolesService: RolesService) {}

  // ─── GET /guilds/:id/roles ─────────────────────────────────────────────────

  @Get('guilds/:id/roles')
  @ApiOperation({ summary: 'Ortam rollerini listele (yalnız üyeler görebilir); position DESC' })
  listRoles(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
  ) {
    return this.rolesService.listRoles(user.id, guildId);
  }

  // ─── POST /guilds/:id/roles ────────────────────────────────────────────────

  @Post('guilds/:id/roles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni rol oluştur (OWNER/ADMIN); position otomatik belirlenir' })
  createRole(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: CreateRoleDto,
  ) {
    return this.rolesService.createRole(user.id, guildId, dto);
  }

  // ─── PATCH /guilds/:id/roles/reorder ─────────────────────────────────────

  @Patch('guilds/:id/roles/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rolleri toplu sırala (drag-reorder; OWNER/ADMIN; @everyone hariç). Dönüş null.' })
  reorderRoles(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: ReorderRolesDto,
  ) {
    return this.rolesService.reorderRoles(user.id, id, dto.items);
  }

  // ─── PATCH /roles/:id ─────────────────────────────────────────────────────

  @Patch('roles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rol güncelle (OWNER/ADMIN); @everyone name/hoist değiştirilemez' })
  updateRole(
    @CurrentUser() user: { id: string },
    @Param('id') roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.updateRole(user.id, roleId, dto);
  }

  // ─── DELETE /roles/:id ────────────────────────────────────────────────────

  @Delete('roles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rol sil (OWNER/ADMIN); @everyone silinemez. Dönüş null.' })
  deleteRole(
    @CurrentUser() user: { id: string },
    @Param('id') roleId: string,
  ) {
    return this.rolesService.deleteRole(user.id, roleId);
  }

  // ─── POST /roles/:id/members/:userId ──────────────────────────────────────

  @Post('roles/:id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Üyeye rol ata (OWNER/ADMIN; idempotent). Dönüş: güncel üye DTO (roles dahil).' })
  assignRole(
    @CurrentUser() user: { id: string },
    @Param('id') roleId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.rolesService.assignRole(user.id, roleId, targetUserId);
  }

  // ─── DELETE /roles/:id/members/:userId ────────────────────────────────────

  @Delete('roles/:id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Üyeden rol çıkar (OWNER/ADMIN; idempotent). Dönüş: güncel üye DTO (roles dahil).' })
  removeRole(
    @CurrentUser() user: { id: string },
    @Param('id') roleId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.rolesService.removeRole(user.id, roleId, targetUserId);
  }
}
