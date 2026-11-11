import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportEvidenceService } from './report-evidence.service';
import { ReportEvidencePurgeJob } from './report-evidence-purge.job';
import { SharedModule } from '../../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportEvidenceService, ReportEvidencePurgeJob],
})
export class ReportsModule {}
