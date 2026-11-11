import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { AuthUser } from '../../common/auth/auth-user';
import { hasPermission } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { requestLocale } from '../../common/request-context';
import { fullName } from '../../common/utils/names';
import { levelRangeLabel } from '../../domain/level-policy';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthContextService } from '../auth/auth-context.service';
import { hashPassword } from '../auth/password';
import { ROLE_KEYS } from '../rbac/permissions';
import {
  AvailabilitySlotDto,
  CreateTeacherDto,
  TeacherAccountDto,
  TeacherAccountResultDto,
  TeacherAdminDto,
  TeacherPublicDto,
  UpdateTeacherDto,
} from './dto/teacher.dto';

const teacherInclude = {
  levelFrom: true,
  levelTo: true,
  user: { select: { email: true } },
} satisfies Prisma.TeacherInclude;

type TeacherRow = Prisma.TeacherGetPayload<{ include: typeof teacherInclude }>;

export function toTeacherPublic(t: TeacherRow): TeacherPublicDto {
  return {
    id: t.id,
    name: fullName(t.firstName, t.lastName),
    firstName: t.firstName,
    lastName: t.lastName,
    photoUrl: t.photoUrl,
    country: t.country,
    nativeLanguage: t.nativeLanguage,
    headline: t.headline,
    bio: t.bio,
    specialization: t.specialization,
    levelFrom: t.levelFrom,
    levelTo: t.levelTo,
    levelsLabel: levelRangeLabel(t.levelFrom, t.levelTo, requestLocale()),
  };
}

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authContext: AuthContextService,
    private readonly clock: ClockService,
  ) {}

  async listPublic(): Promise<TeacherPublicDto[]> {
    const rows = await this.prisma.teacher.findMany({
      where: { isActive: true },
      include: teacherInclude,
      orderBy: [{ sortOrder: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map(toTeacherPublic);
  }

  async getPublic(id: string): Promise<TeacherPublicDto> {
    const row = await this.prisma.teacher.findFirst({ where: { id, isActive: true }, include: teacherInclude });
    if (!row) throw notFound('Teacher');
    return toTeacherPublic(row);
  }

  async listAdmin(viewer: AuthUser): Promise<TeacherAdminDto[]> {
    const rows = await this.prisma.teacher.findMany({
      include: teacherInclude,
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { firstName: 'asc' }],
    });
    const upcoming = await this.prisma.session.groupBy({
      by: ['teacherId'],
      where: { status: 'SCHEDULED', startsAt: { gte: this.clock.now() }, teacherId: { not: null } },
      _count: { _all: true },
    });
    const counts = new Map(upcoming.map((u) => [u.teacherId, u._count._all]));
    return rows.map((t) => this.toAdmin(t, viewer, counts.get(t.id) ?? 0));
  }

  async getAdmin(id: string, viewer: AuthUser): Promise<TeacherAdminDto> {
    const row = await this.prisma.teacher.findUnique({ where: { id }, include: teacherInclude });
    if (!row) throw notFound('Teacher');
    const upcoming = await this.prisma.session.count({
      where: { teacherId: id, status: 'SCHEDULED', startsAt: { gte: this.clock.now() } },
    });
    return this.toAdmin(row, viewer, upcoming);
  }

  async create(dto: CreateTeacherDto, actor: AuthUser): Promise<TeacherAdminDto> {
    const row = await this.prisma.teacher.create({
      data: { ...dto, availability: (dto.availability ?? []) as unknown as Prisma.InputJsonValue },
      include: teacherInclude,
    });
    await this.audit.log({ actor, action: 'teacher.create', entityType: 'Teacher', entityId: row.id, newValue: dto });
    return this.toAdmin(row, actor, 0);
  }

  async update(id: string, dto: UpdateTeacherDto, actor: AuthUser): Promise<TeacherAdminDto> {
    const before = await this.prisma.teacher.findUnique({ where: { id } });
    if (!before) throw notFound('Teacher');
    if (dto.sessionRate !== undefined && !hasPermission(actor, 'teachers.view_rates')) {
      throw new DomainError('FORBIDDEN', { message: 'You cannot change teacher rates.' });
    }
    const row = await this.prisma.teacher.update({
      where: { id },
      data: {
        ...dto,
        availability: dto.availability ? (dto.availability as unknown as Prisma.InputJsonValue) : undefined,
      },
      include: teacherInclude,
    });
    await this.audit.log({ actor, action: 'teacher.update', entityType: 'Teacher', entityId: id, oldValue: before, newValue: dto });
    if (before.userId) this.authContext.invalidateUser(before.userId);
    return this.getAdmin(row.id, actor);
  }

  /** Creates (or links) a login for the teacher with the TEACHER role. */
  async createAccount(id: string, dto: TeacherAccountDto, actor: AuthUser): Promise<TeacherAccountResultDto> {
    const teacher = await this.prisma.teacher.findUnique({ where: { id } });
    if (!teacher) throw notFound('Teacher');
    const email = dto.email.trim().toLowerCase();
    const temporaryPassword = dto.password ? undefined : `Tc-${randomBytes(6).toString('base64url')}9`;
    const passwordHash = await hashPassword(dto.password ?? temporaryPassword!);

    const result = await this.prisma.transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({ where: { key: ROLE_KEYS.TEACHER } });
      let user = await tx.user.findUnique({ where: { email } });
      if (user) {
        const linked = await tx.teacher.findUnique({ where: { userId: user.id } });
        if (linked && linked.id !== id) throw new DomainError('AUTH_EMAIL_TAKEN');
        user = await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      } else {
        user = await tx.user.create({
          data: { email, passwordHash, displayName: fullName(teacher.firstName, teacher.lastName), locale: requestLocale() },
        });
      }
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {},
      });
      await tx.teacher.update({ where: { id }, data: { userId: user.id } });
      await this.audit.log(
        { actor, action: 'teacher.account', entityType: 'Teacher', entityId: id, newValue: { userId: user.id, email } },
        tx,
      );
      return user;
    });
    this.authContext.invalidateUser(result.id);
    return { userId: result.id, email, ...(temporaryPassword ? { temporaryPassword } : {}) };
  }

  private toAdmin(t: TeacherRow, viewer: AuthUser, upcomingSessions: number): TeacherAdminDto {
    return {
      ...toTeacherPublic(t),
      userId: t.userId,
      loginEmail: t.user?.email ?? null,
      englishLevel: t.englishLevel,
      availability: (Array.isArray(t.availability) ? t.availability : []) as unknown as AvailabilitySlotDto[],
      sessionRate: hasPermission(viewer, 'teachers.view_rates') ? t.sessionRate : null,
      isActive: t.isActive,
      sortOrder: t.sortOrder,
      upcomingSessions,
    };
  }
}
