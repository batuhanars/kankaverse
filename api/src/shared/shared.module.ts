import { Module } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { MembershipService } from './membership/membership.service';

@Module({
  providers: [EmailService, MembershipService],
  exports: [EmailService, MembershipService],
})
export class SharedModule {}
