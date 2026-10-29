import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AttachmentsService } from './attachments.service';
import { PresignAttachmentDto } from './dto/presign-attachment.dto';
import { DownloadAttachmentQueryDto } from './dto/download-attachment-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private attachmentsService: AttachmentsService) {}

  @Post('presign')
  @UseGuards(VerifiedEmailGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Dosya yükleme için presigned PUT URL al (doğrulanmış e-posta zorunlu)',
  })
  presign(@CurrentUser() user: { id: string }, @Body() dto: PresignAttachmentDto) {
    return this.attachmentsService.presign(user.id, dto);
  }

  @Post(':id/forward')
  @UseGuards(VerifiedEmailGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      '[R7] Mesaj ekini iletmek için kopyala (kaynak kanal erişimi + scan kapısı; yeni bekleyen ek döner, mesaj göndermez)',
  })
  forward(@CurrentUser() user: { id: string }, @Param('id') attachmentId: string) {
    return this.attachmentsService.forward(user.id, attachmentId);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      "[R7] Dosya indirme URL (erişim kontrolü + scan kapısı; redirect yok — presigned URL body'de döner)",
  })
  getDownloadUrl(
    @CurrentUser() user: { id: string },
    @Param('id') attachmentId: string,
    @Query() query: DownloadAttachmentQueryDto,
  ) {
    return this.attachmentsService.getDownloadUrl(user.id, attachmentId, !!query.download);
  }
}
