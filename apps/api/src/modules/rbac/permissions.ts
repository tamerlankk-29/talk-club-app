/**
 * Permission catalog. Keys are defined in code (endpoints check them);
 * which roles hold which permissions is data, editable in Admin → Roles.
 */
export const PERMISSIONS = {
  'dashboard.view': { group: 'Dashboard', description: 'View the admin dashboard' },
  'analytics.view': { group: 'Dashboard', description: 'View analytics and reports (non-financial)' },
  'finance.view': { group: 'Dashboard', description: 'View revenue and financial reports' },

  'clients.view': { group: 'Clients', description: 'View clients and their profiles' },
  'clients.manage': { group: 'Clients', description: 'Create and edit clients' },
  'clients.delete': { group: 'Clients', description: 'Archive clients and process deletion requests' },

  'crm.view': { group: 'CRM', description: 'View leads, pipeline and tasks' },
  'crm.manage': { group: 'CRM', description: 'Manage leads, tasks, tags and communications' },
  'segments.manage': { group: 'Marketing', description: 'Create and edit custom segments' },
  'broadcasts.manage': { group: 'Marketing', description: 'Create and send broadcasts' },
  'announcements.manage': { group: 'Marketing', description: 'Manage announcements in the client app' },
  'automations.manage': { group: 'Marketing', description: 'Manage automation rules' },
  'notifications.manage': { group: 'Marketing', description: 'Edit notification templates' },

  'schedule.view': { group: 'Schedule', description: 'View the schedule and sessions' },
  'schedule.manage': { group: 'Schedule', description: 'Create, edit, move and cancel sessions' },
  'bookings.view': { group: 'Bookings', description: 'View bookings and waitlists' },
  'bookings.manage': { group: 'Bookings', description: 'Book, move and cancel on behalf of clients' },
  'bookings.override': { group: 'Bookings', description: 'Override capacity and cancellation penalties' },
  'attendance.mark_own': { group: 'Attendance', description: 'Mark attendance in own sessions' },
  'attendance.manage': { group: 'Attendance', description: 'Mark and correct attendance in any session' },
  'feedback.write': { group: 'Attendance', description: 'Write session feedback for participants' },
  'feedback.view': { group: 'Attendance', description: 'View all teacher feedback' },

  'memberships.view': { group: 'Memberships', description: 'View memberships and visit history' },
  'memberships.manage': { group: 'Memberships', description: 'Grant, extend and correct memberships' },
  'plans.manage': { group: 'Memberships', description: 'Manage membership plans and prices' },
  'payments.view': { group: 'Payments', description: 'View payments' },
  'payments.manage': { group: 'Payments', description: 'Create payment requests and confirm payments' },
  'payments.refund': { group: 'Payments', description: 'Refund payments' },
  'trials.manage': { group: 'CRM', description: 'Manage trial lessons' },

  'teachers.manage': { group: 'Resources', description: 'Manage teacher profiles' },
  'teachers.view_rates': { group: 'Resources', description: 'View teacher session rates' },
  'rooms.manage': { group: 'Resources', description: 'Manage locations and rooms' },
  'catalog.manage': { group: 'Resources', description: 'Manage levels, programs, group types and lead sources' },

  'settings.manage': { group: 'System', description: 'Change club settings, rules and content' },
  'staff.manage': { group: 'System', description: 'Manage staff accounts' },
  'roles.manage': { group: 'System', description: 'Manage roles and permissions' },
  'audit.view': { group: 'System', description: 'View the audit log' },
  'data.export': { group: 'System', description: 'Export data (CSV/XLSX)' },
  'data.import': { group: 'System', description: 'Import clients and historical data' },

  'teacher.portal': { group: 'Teacher', description: 'Access the teacher panel' },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_KEYS = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  TEACHER: 'TEACHER',
  MARKETING: 'MARKETING',
  CLIENT: 'CLIENT',
} as const;

export const DEFAULT_ROLES: Record<string, { name: string; description: string; permissions: PermissionKey[] }> = {
  SUPER_ADMIN: {
    name: 'Super admin',
    description: 'Full access to everything, including roles and staff accounts.',
    permissions: ALL_PERMISSIONS,
  },
  ADMIN: {
    name: 'Admin',
    description: 'Runs the club day to day: clients, bookings, memberships, schedule, CRM and payments.',
    permissions: ALL_PERMISSIONS.filter((p) => !['staff.manage', 'roles.manage', 'teacher.portal'].includes(p)),
  },
  MANAGER: {
    name: 'Manager',
    description: 'Front desk: clients, bookings, schedule, attendance, payment requests and follow-ups.',
    permissions: [
      'dashboard.view',
      'clients.view',
      'clients.manage',
      'crm.view',
      'crm.manage',
      'trials.manage',
      'payments.view',
      'payments.manage',
      'schedule.view',
      'schedule.manage',
      'bookings.view',
      'bookings.manage',
      'attendance.manage',
      'memberships.view',
      'feedback.view',
    ],
  },
  TEACHER: {
    name: 'Teacher',
    description: 'Own sessions, participants, attendance and feedback.',
    permissions: ['teacher.portal', 'attendance.mark_own', 'feedback.write'],
  },
  MARKETING: {
    name: 'Marketing',
    description: 'CRM, segments, broadcasts and campaigns.',
    permissions: [
      'dashboard.view',
      'analytics.view',
      'clients.view',
      'crm.view',
      'crm.manage',
      'segments.manage',
      'broadcasts.manage',
      'announcements.manage',
      'automations.manage',
      'notifications.manage',
    ],
  },
  CLIENT: {
    name: 'Client',
    description: 'Club member using the client app.',
    permissions: [],
  },
};

/** Roles that grant access to the admin panel (any permission other than the teacher portal). */
export function isStaffPermissionSet(perms: Set<string>): boolean {
  for (const p of perms) if (p !== 'teacher.portal' && p !== 'attendance.mark_own' && p !== 'feedback.write') return true;
  return false;
}
