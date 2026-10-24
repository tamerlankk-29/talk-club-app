import { ApiProperty } from '@nestjs/swagger';

export class ClubProfileDto {
  name: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  telegram: string;
  tiktok: string;
  website: string;
  @ApiProperty({ enum: ['google', '2gis', 'osm'] })
  mapProvider: 'google' | '2gis' | 'osm';
}

export class BrandingDto {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
}

export class HowItWorksStepDto {
  title: string;
  text: string;
}

export class FaqItemDto {
  question: string;
  answer: string;
}

export class ClubContentDto {
  /** Markdown */
  about: string;
  howItWorks: HowItWorksStepDto[];
  /** Markdown */
  rules: string;
  faq: FaqItemDto[];
  contactNote: string;
}

export class PublicLocationDto {
  id: string;
  name: string;
  address: string;
  addressDetails: string | null;
  city: string;
  country: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  directions: string | null;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'object', nullable: true } })
  workingHours: unknown;
}

export class CancellationPolicyDto {
  @ApiProperty({ enum: ['PREVIOUS_DAY_AT', 'HOURS_BEFORE'] })
  mode: 'PREVIOUS_DAY_AT' | 'HOURS_BEFORE';
  previousDayTime: string;
  hoursBefore: number;
  graceMinutesAfterBooking: number;
}

export class TrialPolicyDto {
  enabled: boolean;
  price: number;
  selfBooking: boolean;
}

export class WaitlistPolicyDto {
  enabled: boolean;
  offerMinutes: number;
}

export class ClubPoliciesDto {
  cancellation: CancellationPolicyDto;
  sessionDurationMinutes: number;
  groupSize: number;
  membershipValidityDays: number;
  bookingOpenDaysAhead: number;
  trial: TrialPolicyDto;
  waitlist: WaitlistPolicyDto;
  qrCheckinEnabled: boolean;
  feedbackVisible: boolean;
  referralsEnabled: boolean;
  referralReward: string;
}

export class PublicPlanDto {
  id: string;
  code: string;
  name: string;
  visits: number;
  price: number;
  validityDays: number;
  isFeatured: boolean;
  description: string | null;
}

export class PublicClubDto {
  club: ClubProfileDto;
  branding: BrandingDto;
  content: ClubContentDto;
  location: PublicLocationDto | null;
  policies: ClubPoliciesDto;
  plans: PublicPlanDto[];
}
