import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { AiVideoController } from './ai-video.controller';
import { AiVideoService } from './ai-video.service';
import { AiVideoPoller } from './ai-video.poller';
import { AiVideoAccessGuard } from './ai-video-access.guard';
import { PikaClient } from './pika.client';

@Module({
  imports: [SharedModule],
  controllers: [AiVideoController],
  providers: [AiVideoService, AiVideoPoller, AiVideoAccessGuard, PikaClient],
})
export class AiVideoModule {}
