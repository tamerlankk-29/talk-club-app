import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { DomainError } from '../errors/domain-error';
import type { AuthUser } from './auth-user';

/** Resolves which client profile a self-service request acts for (own or a managed child). */
@Injectable()
export class ActingClientGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser; actingClient?: { clientId: string; viaGuardian: boolean } }>();
    const user = req.user;
    if (!user) throw new DomainError('UNAUTHENTICATED');

    const requested = req.header('x-acting-client')?.trim();
    if (requested && requested !== user.clientId) {
      if (!user.managedClientIds.includes(requested)) {
        throw new DomainError('FORBIDDEN', { message: 'You cannot act for this profile.' });
      }
      req.actingClient = { clientId: requested, viaGuardian: true };
      return true;
    }
    if (!user.clientId) throw new DomainError('CLIENT_PROFILE_REQUIRED');
    req.actingClient = { clientId: user.clientId, viaGuardian: false };
    return true;
  }
}
