import { ApiProperty } from '@nestjs/swagger';
import { AttendanceMethod, AttendanceStatus, BookingKind, BookingStatus, ClientCategory } from '@prisma/client';
import { SessionDto } from '../../sessions/dto/session.dto';
import { TeacherPublicDto } from '../../teachers/dto/teacher.dto';
import { FeedbackScoresDto } from '../../feedback/dto/feedback-responses.dto';

export class TeacherStatsDto {
  sessionsThisMonth: number;
  participantsThisMonth: number;
  attendanceRate: number | null;
}

export class TeacherProfileDto extends TeacherPublicDto {
  email: string | null;
  stats: TeacherStatsDto;
}

export class TeacherSessionDto extends SessionDto {
  /** Participants whose attendance is not marked yet */
  unmarked: number;
  attendanceFinalized: boolean;
}

export class TeacherAttendanceDto {
  @ApiProperty({ enum: AttendanceStatus, enumName: 'AttendanceStatus' })
  status: AttendanceStatus;
  @ApiProperty({ enum: AttendanceMethod, enumName: 'AttendanceMethod' })
  method: AttendanceMethod;
  markedAt: Date;
}

export class TeacherFeedbackDto extends FeedbackScoresDto {
  comment: string | null;
  isVisibleToClient: boolean;
}

export class TeacherParticipantDto {
  bookingId: string;
  clientId: string;
  name: string;
  firstName: string;
  photoUrl: string | null;
  level: string | null;
  @ApiProperty({ enum: ClientCategory, enumName: 'ClientCategory' })
  category: ClientCategory;
  @ApiProperty({ enum: BookingKind, enumName: 'BookingKind' })
  kind: BookingKind;
  @ApiProperty({ enum: BookingStatus, enumName: 'BookingStatus' })
  status: BookingStatus;
  attendance: TeacherAttendanceDto | null;
  visitsBefore: number;
  isFirstVisit: boolean;
  feedback: TeacherFeedbackDto | null;
}

export class TeacherSessionDetailDto {
  session: SessionDto;
  onlineUrl: string | null;
  canMarkAttendance: boolean;
  feedbackEnabled: boolean;
  participants: TeacherParticipantDto[];
}
