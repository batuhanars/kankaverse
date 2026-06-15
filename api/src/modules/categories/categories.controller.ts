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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post('guilds/:id/categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Kanal kategorisi oluştur (OWNER/ADMIN)' })
  create(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(user.id, guildId, dto);
  }

  @Get('guilds/:id/categories')
  @ApiOperation({ summary: 'Ortam kategorilerini listele (üye)' })
  findByGuild(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
  ) {
    return this.categoriesService.findByGuild(user.id, guildId);
  }

  @Patch('guilds/:id/categories/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kategorileri toplu sırala (drag-reorder; OWNER/ADMIN). Dönüş null.' })
  reorder(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: ReorderCategoriesDto,
  ) {
    return this.categoriesService.reorder(user.id, guildId, dto.items);
  }

  @Patch('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kategori güncelle: ad ve/veya konum (OWNER/ADMIN)' })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.id, categoryId, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kategoriyi soft-delete et; kanallar kategorisiz kalır (OWNER/ADMIN)' })
  remove(
    @CurrentUser() user: { id: string },
    @Param('id') categoryId: string,
  ) {
    return this.categoriesService.remove(user.id, categoryId);
  }
}
