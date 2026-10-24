import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { PaymentsModule } from '../payments/payments.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AdminBookingsController, BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [SessionsModule, MembershipsModule, PaymentsModule],
  controllers: [BookingsController, AdminBookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
