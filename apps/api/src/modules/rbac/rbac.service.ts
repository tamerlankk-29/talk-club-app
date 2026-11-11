import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AuthUser } from '../../common/auth/auth-user';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { requestLocale } from '../../common/request-context';
import { normalizePhone } from '../../common/utils/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthContextService } from '../auth/auth-context.service';
import { hashPassword } from '../auth/password';
import { TwoFactorService } from '../auth/two-factor.service';
import {
  CreateRoleDto,
  CreateStaffDto,
  PermissionDto,
  RoleDto,
  StaffCreatedDto,
  StaffUserDto,
  TeamMemberDto,
  UpdateRoleDto,
  UpdateStaffDto,
} from './dto/rbac.dto';
import { ALL_PERMISSIONS, ROLE_KEYS } from './permissions';
import { syncRbac } from './rbac.sync';

@Injectable()
export class RbacService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authContext: AuthContextService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await syncRbac(this.prisma);
    } catch (error) {
      this.logger.error(`RBAC sync failed: ${(error as Error).message}`);
    }
  }

  async permissions(): Promise<PermissionDto[]> {
    const rows = await this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
    return rows.map((p) => ({ key: p.key, group: p.group, description: p.description }));
  }

  async roles(): Promise<RoleDto[]> {
    const rows = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permission.key).sort(),
      userCount: r._count.users,
    }));
  }

  private validatePermissions(keys: string[]): void {
    const unknown = keys.filter((k) => !ALL_PERMISSIONS.includes(k as never));
    if (unknown.length) throw new DomainError('VALIDATION_FAILED', { message: `Unknown permissions: ${unknown.join(', ')}` });
  }

  async createRole(dto: CreateRoleDto, actor: AuthUser): Promise<RoleDto[]> {
    this.validatePermissions(dto.permissions);
    const permissions = await this.prisma.permission.findMany({ where: { key: { in: dto.permissions } } });
    const role = await this.prisma.role.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    await this.audit.log({ actor, action: 'role.create', entityType: 'Role', entityId: role.id, newValue: dto });
    return this.roles();
  }

  async updateRole(id: string, dto: UpdateRoleDto, actor: AuthUser): Promise<RoleDto[]> {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw notFound('Role');
    if (role.key === ROLE_KEYS.SUPER_ADMIN && dto.permissions) {
      throw new DomainError('FORBIDDEN', { message: 'The super admin role always has every permission.' });
    }
    if (dto.permissions) this.validatePermissions(dto.permissions);
    await this.prisma.transaction(async (tx) => {
      await tx.role.update({ where: { id }, data: { name: dto.name, description: dto.description } });
      if (dto.permissions) {
        const permissions = await tx.permission.findMany({ where: { key: { in: dto.permissions } } });
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: id, permissionId: p.id })) });
      }
      await this.audit.log(
        {
          actor,
          action: 'role.update',
          entityType: 'Role',
          entityId: id,
          oldValue: { name: role.name, permissions: role.permissions.map((p) => p.permission.key).sort() },
          newValue: { name: dto.name ?? role.name, permissions: dto.permissions?.sort() },
        },
        tx,
      );
    });
    this.authContext.invalidateAll();
    return this.roles();
  }

  async deleteRole(id: string, actor: AuthUser): Promise<RoleDto[]> {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw notFound('Role');
    if (role.isSystem) throw new DomainError('FORBIDDEN', { message: 'Built-in roles cannot be deleted.' });
    if (role._count.users > 0) throw new DomainError('CONFLICT', { message: 'Remove this role from all users first.' });
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({ actor, action: 'role.delete', entityType: 'Role', entityId: id, oldValue: { key: role.key } });
    return this.roles();
  }

  async staff(): Promise<StaffUserDto[]> {
    const rows = await this.prisma.user.findMany({
      where: { status: { not: 'DELETED' }, roles: { some: { role: { key: { not: ROLE_KEYS.CLIENT } } } } },
      include: { roles: { include: { role: true } }, teacher: { select: { id: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((u) => this.toStaff(u));
  }

  /** Active staff for assignee pickers — names and roles only. */
  async team(): Promise<TeamMemberDto[]> {
    const rows = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { key: { not: ROLE_KEYS.CLIENT } } } } },
      include: { roles: { include: { role: true } }, teacher: { select: { id: true } } },
      orderBy: { displayName: 'asc' },
    });
    return rows.map((u) => ({
      id: u.id,
      displayName: u.displayName ?? u.email ?? 'Staff member',
      roles: u.roles.map((r) => r.role.key).filter((k) => k !== ROLE_KEYS.CLIENT),
      isTeacher: !!u.teacher,
    }));
  }

  async createStaff(dto: CreateStaffDto, actor: AuthUser): Promise<StaffCreatedDto> {
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.phone && !phone) throw new DomainError('AUTH_PHONE_INVALID');
    if (await this.prisma.user.findUnique({ where: { email } })) throw new DomainError('AUTH_EMAIL_TAKEN');
    if (phone && (await this.prisma.user.findUnique({ where: { phone } }))) throw new DomainError('AUTH_PHONE_TAKEN');
    const roles = await this.prisma.role.findMany({ where: { key: { in: dto.roles } } });
    if (roles.length !== dto.roles.length) throw new DomainError('VALIDATION_FAILED', { message: 'Unknown role.' });
    this.assertCanGrant(actor, dto.roles);
    const temporaryPassword = dto.password ? undefined : `Tc-${randomBytes(6).toString('base64url')}7`;
    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        displayName: dto.displayName,
        passwordHash: await hashPassword(dto.password ?? temporaryPassword!),
        // New colleagues start in the language of the administrator who added them.
        locale: requestLocale(),
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      include: { roles: { include: { role: true } }, teacher: { select: { id: true } } },
    });
    await this.audit.log({ actor, action: 'staff.create', entityType: 'User', entityId: user.id, newValue: { email, roles: dto.roles } });
    return { ...this.toStaff(user), ...(temporaryPassword ? { temporaryPassword } : {}) };
  }

  async updateStaff(id: string, dto: UpdateStaffDto, actor: AuthUser): Promise<StaffUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
    if (!user) throw notFound('User');
    if (id === actor.id && (dto.status === 'BLOCKED' || (dto.roles && !dto.roles.includes(ROLE_KEYS.SUPER_ADMIN) && actor.roles.includes(ROLE_KEYS.SUPER_ADMIN)))) {
      throw new DomainError('FORBIDDEN', { message: 'You cannot block yourself or remove your own super admin role.' });
    }
    if (dto.roles) this.assertCanGrant(actor, dto.roles);
    await this.prisma.transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { displayName: dto.displayName, status: dto.status } });
      if (dto.roles) {
        const roles = await tx.role.findMany({ where: { key: { in: dto.roles } } });
        if (roles.length !== dto.roles.length) throw new DomainError('VALIDATION_FAILED', { message: 'Unknown role.' });
        // Client role is preserved if the staff member also uses the client app.
        const keepClient = user.roles.some((r) => r.role.key === ROLE_KEYS.CLIENT);
        await tx.userRole.deleteMany({ where: { userId: id, role: { key: { not: ROLE_KEYS.CLIENT } } } });
        await tx.userRole.createMany({
          data: roles.filter((r) => r.key !== ROLE_KEYS.CLIENT || keepClient).map((r) => ({ userId: id, roleId: r.id })),
          skipDuplicates: true,
        });
      }
      if (dto.status === 'BLOCKED') {
        await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.log(
        {
          actor,
          action: 'staff.update',
          entityType: 'User',
          entityId: id,
          oldValue: { status: user.status, roles: user.roles.map((r) => r.role.key) },
          newValue: dto,
        },
        tx,
      );
    });
    this.authContext.invalidateAll();
    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id }, include: { roles: { include: { role: true } }, teacher: { select: { id: true } } } });
    return this.toStaff(fresh);
  }

  async resetPassword(id: string, password: string | undefined, actor: AuthUser): Promise<{ temporaryPassword?: string }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('User');
    const temporaryPassword = password ? undefined : `Tc-${randomBytes(6).toString('base64url')}7`;
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password ?? temporaryPassword!) } });
    await this.prisma.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actor, action: 'staff.reset_password', entityType: 'User', entityId: id });
    this.authContext.invalidateAll();
    return temporaryPassword ? { temporaryPassword } : {};
  }

  /** For a lost phone: turns two-factor sign-in off; required roles set it up again at next sign-in. */
  async resetTwoFactor(id: string, actor: AuthUser): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
    if (!user) throw notFound('User');
    // Admins can't strip a super admin's second factor.
    this.assertCanGrant(actor, user.roles.map((r) => r.role.key));
    await this.twoFactor.reset(id);
    await this.prisma.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actor, action: 'staff.reset_2fa', entityType: 'User', entityId: id });
    this.authContext.invalidateAll();
  }

  /** Only super admins can hand out the super admin role. */
  private assertCanGrant(actor: AuthUser, roles: string[]): void {
    if (roles.includes(ROLE_KEYS.SUPER_ADMIN) && !actor.roles.includes(ROLE_KEYS.SUPER_ADMIN)) {
      throw new DomainError('FORBIDDEN', { message: 'Only a super admin can grant the super admin role.' });
    }
  }

  private toStaff(u: {
    id: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    totpEnabledAt: Date | null;
    roles: Array<{ role: { key: string } }>;
    teacher: { id: string } | null;
  }): StaffUserDto {
    return {
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      phone: u.phone,
      status: u.status,
      roles: u.roles.map((r) => r.role.key),
      teacherId: u.teacher?.id ?? null,
      twoFactorEnabled: !!u.totpEnabledAt,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    };
  }
}
