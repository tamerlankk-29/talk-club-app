import { ApiProperty } from '@nestjs/swagger';
import { ReferralStatus } from '@prisma/client';
import { SessionUserDto } from '../../auth/dto/auth.dto';
import { BookingDto, ClientSessionDto, WaitlistItemDto } from '../../bookings/dto/booking.dto';
import { ClientProfileDto } from '../../clients/dto/client.dto';
import { AnnouncementDto } from '../../marketing/dto/marketing.dto';
import { MembershipDto } from '../../memberships/dto/membership.dto';
import { PaymentDto } from '../../payments/dto/payment.dto';

export class MeDto {
  user: SessionUserDto;
  /** The signed-in user's own client profile */
  profile: ClientProfileDto | null;
}

export class HomeStatsDto {
  attendedThisMonth: number;
  minutesThisMonth: number;
  streakWeeks: number;
  totalAttended: number;
}

export class HomeDto {
  greetingName: string;
  membership: MembershipDto | null;
  nextBooking: BookingDto | null;
  upcomingCount: number;
  waitlist: WaitlistItemDto[];
  pendingPayments: PaymentDto[];
  unreadNotifications: number;
  /** A bookable session matching level and preferences */
  recommended: ClientSessionDto | null;
  today: ClientSessionDto[];
  tomorrow: ClientSessionDto[];
  announcements: AnnouncementDto[];
  stats: HomeStatsDto;
  trialAvailable: boolean;
  trialPrice: number;
  hasEverHadMembership: boolean;
}

export class ReferredFriendDto {
  firstName: string;
  @ApiProperty({ enum: ReferralStatus, enumName: 'ReferralStatus' })
  status: ReferralStatus;
  createdAt: Date;
}

export class ReferralInfoDto {
  enabled: boolean;
  code: string;
  link: string;
  rewardDescription: string;
  referrals: ReferredFriendDto[];
}

export class FamilyMemberDto {
  profile: ClientProfileDto;
  relationship: string | null;
  membership: MembershipDto | null;
}

export class AgreementDto {
  title: string;
  type: string;
  version: number;
  context: string;
  acceptedAt: Date;
}

export class DeletionRequestResultDto {
  requested: boolean;
}
