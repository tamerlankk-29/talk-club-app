import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiHeader, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { AuthUser } from './auth-user';
import { ActingClientGuard } from './acting-client.guard';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const OPTIONAL_AUTH_KEY = 'auth:optional';
export const PERMISSIONS_KEY = 'auth:permissions';

/** No authentication required. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Authentication is optional: `@CurrentUser()` is null for anonymous callers. */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

/** Requires every listed permission (checked server-side on each request). */
export const RequirePermissions = (...permissions: string[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED — missing or expired access token' }),
    ApiForbiddenResponse({ description: `FORBIDDEN — requires permission(s): ${permissions.join(', ')}` }),
  );

/**
 * Marks a controller/route as part of the client self-service area.
 * The acting client is the caller's own profile, or — when the `X-Acting-Client`
 * header is sent — a child profile the caller manages as a guardian.
 */
export const ClientArea = () =>
  applyDecorators(
    UseGuards(ActingClientGuard),
    ApiBearerAuth(),
    ApiHeader({
      name: 'X-Acting-Client',
      required: false,
      description: 'Client id of a child profile managed by the signed-in parent/guardian',
    }),
    ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED' }),
    ApiForbiddenResponse({ description: 'CLIENT_PROFILE_REQUIRED — the account has no client profile' }),
  );

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | null => {
  const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  return request.user ?? null;
});

export interface ActingClientRef {
  clientId: string;
  viaGuardian: boolean;
}

export const ActingClient = createParamDecorator((_: unknown, ctx: ExecutionContext): ActingClientRef => {
  const request = ctx.switchToHttp().getRequest<{ actingClient?: ActingClientRef }>();
  if (!request.actingClient) throw new Error('ActingClient used without @ClientArea()');
  return request.actingClient;
});

/**
 * For optional-auth reads (schedule, session details): the client profile the
 * viewer is browsing as — a managed child when `X-Acting-Client` names one,
 * otherwise the caller's own profile, or null for anonymous/staff callers.
 */
export const ViewerClientId = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  const request = ctx.switchToHttp().getRequest<{ user?: AuthUser; header(name: string): string | undefined }>();
  const user = request.user;
  if (!user) return null;
  const requested = request.header('x-acting-client')?.trim();
  if (requested && user.managedClientIds.includes(requested)) return requested;
  return user.clientId ?? null;
});
