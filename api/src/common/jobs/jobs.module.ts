import { Module } from '@nestjs/common';
import { AgeCheckJob } from './age-check.job';
import { PurgeJob } from './purge.job';

@Module({
  providers: [AgeCheckJob, PurgeJob],
})
export class JobsModule {}
