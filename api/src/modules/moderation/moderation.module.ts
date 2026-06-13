import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationModuleService } from './moderation.service';
import { ModeratorGuard } from '../../common/guards/moderator.guard';

@Module({
  controllers: [ModerationController],
  providers: [ModerationModuleService, ModeratorGuard],
})
export class ModerationModule {}
