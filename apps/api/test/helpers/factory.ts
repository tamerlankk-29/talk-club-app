import type { ClientCategory } from '@prisma/client';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../src/common/auth/auth-user';
import { Baseline, ensureBaseline } from '../../src/database/baseline';
import { AuthContextService } from '../../src/modules/auth/auth-context.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { MembershipsService } from '../../src/modules/memberships/memberships.service';
import { ROLE_KEYS } from '../../src/modules/rbac/permissions';
import type { TestApp } from './test-app';

export const TZ = 'Asia/Almaty';

/** Club-local date-time → Date, e.g. at('2026-10-07 18:30'). */
export function at(local: string): Date {
  return DateTime.fromFormat(local, 'yyyy-MM-dd HH:mm', { zone: TZ }).toJSDate();
}

let phoneCounter = 0;
function nextPhone(): string {
  phoneCounter += 1;
  return `+7701${String(10_000_000 + phoneCounter).slice(1)}`;
}

export interface TestClient {
  clientId: string;
  userId: string;
  token: string;
  auth: () => { Authorization: string };
}

export interface TestStaff {
  userId: string;
  token: string;
  user: AuthUser;
  auth: () => { Authorization: string };
}

/** Builds test fixtures through the real services (so fixtures obey the same rules as production). */
export class Factory {
  baseline!: Baseline;
  admin!: TestStaff;
  private teacherCount = 0;

  constructor(private readonly t: TestApp) {}

  async init(): Promise<this> {
    this.baseline = await ensureBaseline(this.t.prisma);
    this.admin = await this.staff(ROLE_KEYS.SUPER_ADMIN, 'Test Admin');
    return this;
  }

  async token(userId: string): Promise<string> {
    const session = await this.t.get(AuthService).issueSession(userId);
    return session.accessToken;
  }

  async authUser(userId: string): Promise<AuthUser> {
    const ctx = this.t.get(AuthContextService);
    ctx.invalidateUser(userId);
    const { user } = await ctx.load(userId, null);
    return user!;
  }

  async staff(roleKey: string, displayName = `${roleKey} user`): Promise<TestStaff> {
    const role = await this.t.prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await this.t.prisma.user.create({
      data: {
        email: `${roleKey.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`,
        displayName,
        roles: { create: { roleId: role.id } },
      },
    });
    const token = await this.token(user.id);
    return { userId: user.id, token, user: await this.authUser(user.id), auth: () => ({ Authorization: `Bearer ${token}` }) };
  }

  async teacher(firstName?: string, withLogin = false): Promise<{ teacherId: string; staff?: TestStaff }> {
    this.teacherCount += 1;
    let userId: string | null = null;
    let staff: TestStaff | undefined;
    if (withLogin) {
      staff = await this.staff(ROLE_KEYS.TEACHER, firstName ?? `Teacher ${this.teacherCount}`);
      userId = staff.userId;
    }
    const teacher = await this.t.prisma.teacher.create({
      data: { firstName: firstName ?? `Teacher${this.teacherCount}`, userId, country: 'USA' },
    });
    if (staff) staff.user = await this.authUser(staff.userId);
    return { teacherId: teacher.id, staff };
  }

  async client(opts: { firstName?: string; level?: string; category?: ClientCategory; withUser?: boolean } = {}): Promise<TestClient> {
    const phone = nextPhone();
    const clientRole = await this.t.prisma.role.findUniqueOrThrow({ where: { key: ROLE_KEYS.CLIENT } });
    const user =
      opts.withUser === false
        ? null
        : await this.t.prisma.user.create({
            data: { phone, displayName: opts.firstName ?? 'Client', roles: { create: { roleId: clientRole.id } } },
          });
    const client = await this.t.prisma.client.create({
      data: {
        firstName: opts.firstName ?? 'Client',
        lastName: 'Test',
        phone,
        userId: user?.id ?? null,
        category: opts.category ?? 'ADULT',
        levelId: opts.level ? this.baseline.levels[opts.level] : this.baseline.levels.Intermediate,
      },
    });
    const token = user ? await this.token(user.id) : '';
    return { clientId: client.id, userId: user?.id ?? '', token, auth: () => ({ Authorization: `Bearer ${token}` }) };
  }

  /** Grants a membership through MembershipsService (ledger-based), optionally pre-using visits. */
  async membership(
    clientId: string,
    opts: { plan?: keyof Baseline['plans']; visits?: number; startsAt?: Date; validityDays?: number } = {},
  ): Promise<string> {
    const detail = await this.t.get(MembershipsService).grant(
      {
        clientId,
        planId: this.baseline.plans[opts.plan ?? 'STANDARD'],
        visits: opts.visits,
        startsAt: (opts.startsAt ?? this.t.clock.now()).toISOString(),
        validityDays: opts.validityDays,
        reason: 'Test fixture',
      },
      this.admin.user,
    );
    return detail.id;
  }

  async session(opts: {
    startsAt: Date;
    durationMinutes?: number;
    capacity?: number;
    teacherId?: string | null;
    roomCode?: '314' | '315' | '316' | null;
    levelMin?: string;
    levelMax?: string;
    groupType?: keyof Baseline['groupTypes'];
    trialsAllowed?: boolean;
  }): Promise<string> {
    const teacherId = opts.teacherId === undefined ? (await this.teacher()).teacherId : opts.teacherId;
    const session = await this.t.prisma.session.create({
      data: {
        programId: this.baseline.programId,
        locationId: this.baseline.locationId,
        // No room unless a test asks for one, so fixtures never collide on the room constraint.
        roomId: opts.roomCode ? this.baseline.rooms[opts.roomCode] : null,
        teacherId,
        groupTypeId: this.baseline.groupTypes[opts.groupType ?? 'speaking'],
        levelMinId: opts.levelMin ? this.baseline.levels[opts.levelMin] : null,
        levelMaxId: opts.levelMax ? this.baseline.levels[opts.levelMax] : null,
        startsAt: opts.startsAt,
        endsAt: new Date(opts.startsAt.getTime() + (opts.durationMinutes ?? 90) * 60_000),
        capacity: opts.capacity ?? 7,
        trialsAllowed: opts.trialsAllowed ?? true,
      },
    });
    return session.id;
  }

  async visitsRemaining(membershipId: string): Promise<number> {
    const m = await this.t.prisma.membership.findUniqueOrThrow({ where: { id: membershipId } });
    const ledger = await this.t.prisma.membershipTransaction.aggregate({ where: { membershipId }, _sum: { delta: true } });
    // The cache must always equal the ledger.
    expect(m.visitsRemaining).toBe(ledger._sum.delta ?? 0);
    return m.visitsRemaining;
  }
}
