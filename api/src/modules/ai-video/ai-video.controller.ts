import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiVideoService } from './ai-video.service';
import { PresignAiInputDto, QuoteAiVideoDto } from './dto/ai-video.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { AiVideoAccessGuard } from './ai-video-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type AuthUser = { id: string };

/** C14 — yalnız açık listedeki hesaplar (AiVideoAccessGuard, R7); diğerlerine jenerik 403. */
@ApiTags('ai-video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, VerifiedEmailGuard, AiVideoAccessGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('ai-video')
export class AiVideoController {
  constructor(private service: AiVideoService) {}

  @Post('input/presign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Görselden üretim için girdi görselinin presigned PUT adresi' })
  presign(@CurrentUser() user: AuthUser, @Body() dto: PresignAiInputDto) {
    return this.service.presignInput(user.id, dto.contentType, dto.size);
  }

  @Post('quote')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ücretsiz fiyat teklifi al (QUOTED satır açar, harcama yok)' })
  quote(@CurrentUser() user: AuthUser, @Body() dto: QuoteAiVideoDto) {
    return this.service.quote(user.id, dto.prompt, dto.inputKey);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Teklifi onayla ve üretimi başlat (para harcar)' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user.id, id);
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
}
