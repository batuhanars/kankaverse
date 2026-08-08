import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { VoiceModule } from '../voice/voice.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

// D54 (Sprint R19) — VoiceModule: ChannelsService.update GUILD_VOICE ageGated/mediaEnabled
// değişince VoiceService.refreshChannelPermissions'ı çağırır (bağlı katılımcıların izin tazelemesi).
@Module({
  imports: [SharedModule, VoiceModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
})
export class ChannelsModule {}
