import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthContextService } from '../../modules/auth/auth-context.service';
import { TokenService } from '../../modules/auth/token.service';
import { DomainError } from '../errors/domain-error';
import type { AuthUser } from './auth-user';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY, PERMISSIONS_KEY } from './decorators';

/**
 * Global guard: authenticates the Bearer access token and enforces
 * @RequirePermissions on every route. Authorization is always server-side;
 * the frontend only hides what the user cannot do.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly authContext: AuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ?? false;
    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, targets) ?? false;

    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;

    if (!token) {
      if (isPublic || isOptional) return true;
      throw new DomainError('UNAUTHENTICATED');
    }

    let payload: { sub: string; sid: string };
    try {
      payload = this.tokens.verifyAccess(token);
    } catch {
      if (isPublic) return true;
      throw new DomainError('UNAUTHENTICATED', { message: 'Your session has expired. Please sign in again.' });
    }

    const { user, blocked } = await this.authContext.load(payload.sub, payload.sid);
    if (blocked) throw new DomainError('AUTH_ACCOUNT_BLOCKED');
    if (!user) {
      if (isPublic) return true;
      throw new DomainError('UNAUTHENTICATED');
    }
    req.user = user;

    const required = this.reflector.getAllAndMerge<string[]>(PERMISSIONS_KEY, targets) ?? [];
    if (required.length && !required.every((permission) => user.permissions.has(permission))) {
      throw new DomainError('FORBIDDEN', { details: { required } });
    }
    return true;
  }
}
