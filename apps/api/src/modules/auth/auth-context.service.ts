import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../prisma/prisma.service';

const TTL_MS = 30_000;

/**
 * Loads the principal (roles → permissions, client/teacher profiles, managed
 * children) for a user id. Cached briefly; role and permission changes call
 * `invalidate*` so they apply within seconds without re-login.
 */
@Injectable()
export class AuthContextService {
  private readonly users = new Map<string, { value: AuthUser | null; blocked: boolean; loadedAt: number }>();
  private readonly sessions = new Map<string, { valid: boolean; loadedAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async load(userId: string, sessionId: string | null): Promise<{ user: AuthUser | null; blocked: boolean }> {
    if (sessionId && !(await this.isSessionValid(sessionId, userId))) return { user: null, blocked: false };
    const cached = this.users.get(userId);
    if (cached && Date.now() - cached.loadedAt < TTL_MS) {
      return { user: cached.value ? { ...cached.value, sessionId } : null, blocked: cached.blocked };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        client: { select: { id: true, firstName: true, lastName: true } },
        teacher: { select: { id: true, firstName: true, lastName: true, isActive: true } },
        guardianOf: { select: { clientId: true } },
      },
    });

    if (!user || user.status === 'DELETED') {
      this.users.set(userId, { value: null, blocked: false, loadedAt: Date.now() });
      return { user: null, blocked: false };
    }
    if (user.status === 'BLOCKED') {
      this.users.set(userId, { value: null, blocked: true, loadedAt: Date.now() });
      return { user: null, blocked: true };
    }

    const permissions = new Set<string>();
    for (const userRole of user.roles) {
      for (const rp of userRole.role.permissions) permissions.add(rp.permission.key);
    }
    const clientName = [user.client?.firstName, user.client?.lastName].filter(Boolean).join(' ');
    const teacherName = [user.teacher?.firstName, user.teacher?.lastName].filter(Boolean).join(' ');
    const name = user.displayName || clientName || teacherName;

    const value: AuthUser = {
      id: user.id,
      sessionId,
      displayName: name || user.email || user.phone || 'User',
      phone: user.phone,
      email: user.email,
      roles: user.roles.map((r) => r.role.key),
      permissions,
      clientId: user.client?.id ?? null,
      teacherId: user.teacher?.isActive ? user.teacher.id : null,
      managedClientIds: user.guardianOf.map((g) => g.clientId),
    };
    this.users.set(userId, { value, blocked: false, loadedAt: Date.now() });
    return { user: value, blocked: false };
  }

  private async isSessionValid(sessionId: string, userId: string): Promise<boolean> {
    const cached = this.sessions.get(sessionId);
    if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached.valid;
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true },
    });
    const valid = !!session && session.userId === userId && !session.revokedAt && session.expiresAt > new Date();
    this.sessions.set(sessionId, { valid, loadedAt: Date.now() });
    return valid;
  }

  invalidateUser(userId: string): void {
    this.users.delete(userId);
  }

  invalidateSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  invalidateAll(): void {
    this.users.clear();
    this.sessions.clear();
  }
}
