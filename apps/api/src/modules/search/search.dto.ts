import { ApiProperty } from '@nestjs/swagger';
import { ClientStatus, LeadStage, PaymentStatus } from '@prisma/client';

export class SearchClientDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  level: string | null;
  @ApiProperty({ enum: ClientStatus, enumName: 'ClientStatus' })
  status: ClientStatus;
}

export class SearchLeadDto {
  id: string;
  name: string;
  phone: string | null;
  @ApiProperty({ enum: LeadStage, enumName: 'LeadStage' })
  stage: LeadStage;
}

export class SearchTeacherDto {
  id: string;
  name: string;
  isActive: boolean;
}

export class SearchPaymentDto {
  id: string;
  reference: string | null;
  amount: number;
  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  status: PaymentStatus;
  client: string;
}

export class SearchMembershipClientDto {
  id: string;
  name: string;
}

export class SearchMembershipDto {
  id: string;
  planName: string;
  visitsRemaining: number;
  client: SearchMembershipClientDto;
}

export class SearchResultDto {
  clients: SearchClientDto[];
  leads: SearchLeadDto[];
  teachers: SearchTeacherDto[];
  payments: SearchPaymentDto[];
  memberships: SearchMembershipDto[];
}
