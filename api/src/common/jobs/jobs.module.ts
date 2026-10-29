import { Module } from '@nestjs/common';
import { AgeCheckJob } from './age-check.job';
import { PurgeJob } from './purge.job';
import { RecentGamePurgeJob } from './recent-game-purge.job';

@Module({
  providers: [AgeCheckJob, PurgeJob, RecentGamePurgeJob],
})
export class JobsModule {}
