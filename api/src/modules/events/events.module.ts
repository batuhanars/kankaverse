import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [SharedModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
