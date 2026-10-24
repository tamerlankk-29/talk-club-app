import { ApiProperty } from '@nestjs/swagger';
import { LeadStage, PaymentStatus, TimeOfDay, TrialOutcome, TrialStatus } from '@prisma/client';

export class TrialLevelRefDto {
  id: string;
  name: string;
}

export class TrialSessionRefDto {
  id: string;
  title: string;
  startsAt: Date;
  label: string;
  teacherName: string | null;
}

export class TrialPaymentRefDto {
  id: string;
  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  status: PaymentStatus;
  amount: number;
}

export class TrialDto {
  id: string;
  name: string;
  phone: string;
  @ApiProperty({ enum: TrialStatus, enumName: 'TrialStatus' })
  status: TrialStatus;
  @ApiProperty({ enum: TrialOutcome, enumName: 'TrialOutcome' })
  outcome: TrialOutcome;
  price: number;
  level: TrialLevelRefDto | null;
  preferredDays: number[];
  @ApiProperty({ enum: TimeOfDay, enumName: 'TimeOfDay', isArray: true })
  preferredTimes: TimeOfDay[];
  comment: string | null;
  notes: string | null;
  source: string;
  clientId: string | null;
  clientName: string | null;
  leadId: string | null;
  @ApiProperty({ enum: LeadStage, enumName: 'LeadStage', nullable: true })
  leadStage: LeadStage | null;
  bookingId: string | null;
  session: TrialSessionRefDto | null;
  payment: TrialPaymentRefDto | null;
  attendedAt: Date | null;
  createdAt: Date;
}
