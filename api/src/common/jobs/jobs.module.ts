import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { AgeCheckJob } from './age-check.job';
import { PurgeJob } from './purge.job';
import { RecentGamePurgeJob } from './recent-game-purge.job';

@Module({
  imports: [SharedModule],
  providers: [AgeCheckJob, PurgeJob, RecentGamePurgeJob],
})
export class JobsModule {}
