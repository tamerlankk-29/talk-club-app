import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { SessionsModule } from '../sessions/sessions.module';
import { TeacherPortalController } from './teacher-portal.controller';
import { TeacherPortalService } from './teacher-portal.service';

@Module({
  imports: [SessionsModule, AttendanceModule],
  controllers: [TeacherPortalController],
  providers: [TeacherPortalService],
})
export class TeacherPortalModule {}
