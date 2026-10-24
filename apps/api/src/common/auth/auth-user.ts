/** The authenticated principal attached to each request by AuthGuard. */
export interface AuthUser {
  id: string;
  /** Refresh-token session id the access token was issued for. */
  sessionId: string | null;
  displayName: string;
  phone: string | null;
  email: string | null;
  roles: string[];
  permissions: Set<string>;
  /** The user's own client profile, if any. */
  clientId: string | null;
  /** Linked teacher profile, if any. */
  teacherId: string | null;
  /** Client profiles this user manages as a parent / guardian. */
  managedClientIds: string[];
}

export function hasPermission(user: AuthUser | null | undefined, permission: string): boolean {
  return !!user && user.permissions.has(permission);
}
