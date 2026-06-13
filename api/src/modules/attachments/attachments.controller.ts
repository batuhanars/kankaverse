import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttachmentsService } from './attachments.service';
import { PresignAttachmentDto } from './dto/presign-attachment.dto';
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
  @ApiOperation({ summary: 'Dosya yükleme için presigned PUT URL al (doğrulanmış e-posta zorunlu)' })
  presign(
    @CurrentUser() user: { id: string },
    @Body() dto: PresignAttachmentDto,
  ) {
    return this.attachmentsService.presign(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: '[R7] Dosya indirme URL (erişim kontrolü + scan kapısı; redirect yok — presigned URL body\'de döner)',
  })
  getDownloadUrl(
    @CurrentUser() user: { id: string },
    @Param('id') attachmentId: string,
  ) {
    return this.attachmentsService.getDownloadUrl(user.id, attachmentId);
  }
}
