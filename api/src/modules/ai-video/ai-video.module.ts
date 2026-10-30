import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { AiVideoController } from './ai-video.controller';
import { AiVideoService } from './ai-video.service';
import { AiVideoInputService } from './ai-video-input.service';
import { AiVideoAttachmentService } from './ai-video-attachment.service';
import { AiVideoPoller } from './ai-video.poller';
import { AiVideoAccessGuard } from './ai-video-access.guard';
import { AiVideoDeleteService } from './ai-video-delete.service';
import { AiVideoRecoveryService } from './ai-video-recovery.service';
import { AiVideoGrantsController } from './ai-video-grants.controller';
import { AiVideoGrantsService } from './ai-video-grants.service';
import { PikaClient } from './pika.client';

@Module({
  imports: [SharedModule],
  controllers: [AiVideoController, AiVideoGrantsController],
  providers: [
    AiVideoService,
    AiVideoAttachmentService,
    AiVideoInputService,
    AiVideoPoller,
    AiVideoDeleteService,
    AiVideoRecoveryService,
    AiVideoAccessGuard,
    AiVideoGrantsService,
    PikaClient,
  ],
})
export class AiVideoModule {}
