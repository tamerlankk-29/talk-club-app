import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { BookingsModule } from '../bookings/bookings.module';
import { TrialsController } from './trials.controller';
import { TrialsService } from './trials.service';

@Module({
  imports: [BookingsModule, AttendanceModule],
  controllers: [TrialsController],
  providers: [TrialsService],
  exports: [TrialsService],
})
export class TrialsModule {}
