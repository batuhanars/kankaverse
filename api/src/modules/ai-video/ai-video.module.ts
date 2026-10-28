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
import { PikaClient } from './pika.client';

@Module({
  imports: [SharedModule],
  controllers: [AiVideoController],
  providers: [
    AiVideoService,
    AiVideoAttachmentService,
    AiVideoInputService,
    AiVideoPoller,
    AiVideoDeleteService,
    AiVideoRecoveryService,
    AiVideoAccessGuard,
    PikaClient,
  ],
})
export class AiVideoModule {}
