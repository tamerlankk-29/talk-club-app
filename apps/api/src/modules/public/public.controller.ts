import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PublicClubDto } from './public.dto';

/** Everything the public pages (About, How it works, Rules, FAQ, Location, Contact) need in one call. */
@ApiTags('Public · Club')
@Public()
@Controller('public/club')
export class PublicClubController {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Club profile, branding, content pages, location & hours and the key rules' })
  async club(): Promise<PublicClubDto> {
    const all = await this.settings.getAll();
    const [location, plans] = await Promise.all([
      this.prisma.location.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.membershipPlan.findMany({ where: { isActive: true, isPublic: true }, orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }] }),
    ]);
    return {
      club: all.club,
      branding: all.branding,
      content: all.content,
      location: location
        ? {
            id: location.id,
            name: location.name,
            address: location.address,
            addressDetails: location.addressDetails,
            city: location.city,
            country: location.country,
            timezone: location.timezone,
            latitude: location.latitude,
            longitude: location.longitude,
            phone: location.phone,
            email: location.email,
            directions: location.directions,
            workingHours: location.workingHours,
          }
        : null,
      policies: {
        cancellation: all.cancellation,
        sessionDurationMinutes: all.sessions.defaultDurationMinutes,
        groupSize: all.sessions.defaultCapacity,
        membershipValidityDays: all.memberships.defaultValidityDays,
        bookingOpenDaysAhead: all.booking.openDaysAhead,
        trial: { enabled: all.trial.enabled, price: all.trial.price, selfBooking: all.trial.allowSelfBooking },
        waitlist: { enabled: all.waitlist.enabled, offerMinutes: all.waitlist.offerMinutes },
        qrCheckinEnabled: all.attendance.qrCheckinEnabled,
        feedbackVisible: all.feedback.enabled && all.feedback.visibleToClients,
        referralsEnabled: all.referrals.enabled,
        referralReward: all.referrals.rewardDescription,
      },
      plans: plans.map((p) => ({ id: p.id, code: p.code, name: p.name, visits: p.visits, price: p.price, validityDays: p.validityDays, isFeatured: p.isFeatured, description: p.description })),
    };
  }
}

@Module({ controllers: [PublicClubController] })
export class PublicModule {}
