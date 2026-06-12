import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

@Module({
  imports: [SharedModule],
  controllers: [BlocksController],
  providers: [BlocksService],
})
export class BlocksModule {}
