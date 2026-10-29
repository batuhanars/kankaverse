import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiVideoService } from './ai-video.service';
import { AiVideoInputService } from './ai-video-input.service';
import { AiVideoDeleteService } from './ai-video-delete.service';
import { AiVideoAttachmentService } from './ai-video-attachment.service';
import { CreateAiVideoDto, EstimateAiVideoDto, PresignAiInputDto } from './dto/ai-video.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { AiVideoAccessGuard, AiVideoPreviewOk } from './ai-video-access.guard';
import type { AiVideoRequest } from './ai-video-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type AuthUser = { id: string };

/** C14 — yalnız açık listedeki hesaplar (AiVideoAccessGuard, R7); diğerlerine jenerik 403. */
@ApiTags('ai-video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, VerifiedEmailGuard, AiVideoAccessGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('ai-video')
export class AiVideoController {
  constructor(
    private service: AiVideoService,
    private attachments: AiVideoAttachmentService,
    private input: AiVideoInputService,
    private deletion: AiVideoDeleteService,
  ) {}

  @Post('input/presign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Görselden üretim için girdi görselinin presigned PUT adresi' })
  presign(@CurrentUser() user: AuthUser, @Body() dto: PresignAiInputDto) {
    return this.input.presignInput(user.id, dto.contentType, dto.size);
  }

  @Get('options')
  @AiVideoPreviewOk()
  @ApiOperation({
    summary: 'Açık modeller, süre/çözünürlük seçenekleri, günlük tavan ve bugünkü harcama',
  })
  options(@CurrentUser() user: AuthUser, @Req() req: AiVideoRequest) {
    return this.service.options(user.id, req.aiVideoAllowed !== false);
  }

  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: "Pika'nın gerçek teklifi (satır oluşturmaz, 10 dk önbellek)" })
  estimate(@Body() dto: EstimateAiVideoDto) {
    return this.service.estimate(dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Teklif + günlük tavan + gönderim tek çağrıda (para harcar)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAiVideoDto) {
    return this.service.create(user.id, dto);
  }

  @Post(':id/attachment')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tamamlanan üretimden bekleyen ek üret (mesaj göndermez; istemci mesaj yoluna verir)',
  })
  attachment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attachments.createFromGeneration(user.id, id);
  }

  @Get()
  @ApiOperation({ summary: 'Son 10 üretim' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Tek üretimin durumu (diyalog yoklar)' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.id, id);
  }

  @Delete()
  @ApiOperation({ summary: 'Silinebilir (QUEUED/RUNNING olmayan) tüm üretimlerimi sil' })
  deleteAll(@CurrentUser() user: AuthUser) {
    return this.deletion.deleteAll(user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tek üretimi sil (sürerken 409 AI_VIDEO_BUSY)' })
  deleteOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deletion.deleteOne(user.id, id);
  }
}
