import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { MarketingModule } from '../marketing/marketing.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [BookingsModule, MembershipsModule, PaymentsModule, MarketingModule, ReferralsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
