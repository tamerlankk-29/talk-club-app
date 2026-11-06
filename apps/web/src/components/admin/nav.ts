import {
  BarChart3,
  Bell,
  BookOpenCheck,
  Bot,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  Database,
  FileClock,
  Filter,
  GraduationCap,
  KanbanSquare,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Any of these permissions shows the item. */
  anyOf: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, anyOf: ['dashboard.view'] }],
  },
  {
    label: 'Club',
    items: [
      { href: '/admin/schedule', label: 'Schedule', icon: CalendarDays, anyOf: ['schedule.view'] },
      { href: '/admin/attendance', label: 'Attendance', icon: ClipboardCheck, anyOf: ['attendance.manage'] },
      { href: '/admin/bookings', label: 'Bookings', icon: BookOpenCheck, anyOf: ['bookings.view'] },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/admin/clients', label: 'Clients', icon: Users, anyOf: ['clients.view'] },
      { href: '/admin/crm', label: 'CRM pipeline', icon: KanbanSquare, anyOf: ['crm.view'] },
      { href: '/admin/trials', label: 'Trials', icon: Sparkles, anyOf: ['trials.manage'] },
      { href: '/admin/tasks', label: 'Tasks', icon: ListTodo, anyOf: ['crm.view'] },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/admin/payments', label: 'Payments', icon: CreditCard, anyOf: ['payments.view'] },
      { href: '/admin/memberships', label: 'Memberships', icon: Ticket, anyOf: ['memberships.view'] },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/admin/broadcasts', label: 'Broadcasts', icon: Send, anyOf: ['broadcasts.manage'] },
      { href: '/admin/announcements', label: 'Announcements', icon: Megaphone, anyOf: ['announcements.manage'] },
      { href: '/admin/segments', label: 'Segments', icon: Filter, anyOf: ['segments.manage'] },
      { href: '/admin/automations', label: 'Automations', icon: Bot, anyOf: ['automations.manage'] },
      { href: '/admin/notifications', label: 'Notifications', icon: Bell, anyOf: ['notifications.manage'] },
    ],
  },
  {
    label: 'Insights',
    items: [{ href: '/admin/reports', label: 'Reports', icon: BarChart3, anyOf: ['analytics.view', 'finance.view'] }],
  },
  {
    label: 'Team & system',
    items: [
      { href: '/admin/teachers', label: 'Teachers', icon: GraduationCap, anyOf: ['teachers.manage'] },
      { href: '/admin/staff', label: 'Staff & roles', icon: ShieldCheck, anyOf: ['staff.manage', 'roles.manage'] },
      { href: '/admin/settings', label: 'Settings', icon: Settings, anyOf: ['settings.manage', 'catalog.manage', 'rooms.manage', 'plans.manage'] },
      { href: '/admin/data', label: 'Import & export', icon: Database, anyOf: ['data.export', 'data.import', 'clients.delete'] },
      { href: '/admin/audit', label: 'Audit log', icon: FileClock, anyOf: ['audit.view'] },
    ],
  },
];

export function visibleNav(permissions: string[]): NavGroup[] {
  const has = new Set(permissions);
  return ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.anyOf.some((p) => has.has(p))) })).filter((g) => g.items.length);
}

export function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}
