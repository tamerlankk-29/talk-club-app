import { Module } from '@nestjs/common';
import { MembershipLedgerService } from './membership-ledger.service';
import { AdminMembershipsController, MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { PlansService } from './plans.service';

@Module({
  controllers: [MembershipsController, AdminMembershipsController],
  providers: [MembershipsService, MembershipLedgerService, PlansService],
  exports: [MembershipsService, MembershipLedgerService, PlansService],
})
export class MembershipsModule {}
