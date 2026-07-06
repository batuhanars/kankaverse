import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SharedModule } from '../../shared/shared.module';
import { VoiceModule } from '../voice/voice.module';

// VoiceModule: C10 kart ses durumu için VoiceService (captureVoiceContext) inject edilir.
@Module({
  imports: [SharedModule, VoiceModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
