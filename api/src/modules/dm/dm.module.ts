import { Module } from '@nestjs/common';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';
import { SharedModule } from '../../shared/shared.module';
import { E2eeModule } from '../e2ee/e2ee.module';

@Module({
  imports: [SharedModule, E2eeModule],
  controllers: [DmController],
  providers: [DmService],
})
export class DmModule {}
