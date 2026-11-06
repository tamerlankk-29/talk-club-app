import { AutomationTrigger } from '@prisma/client';
import { z } from 'zod';
import { segmentRuleSchema } from '../segments/segment-rules';

const channel = z.enum(['IN_APP', 'PUSH', 'EMAIL', 'SMS', 'WHATSAPP', 'TELEGRAM']);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SEND_NOTIFICATION'),
    /** Use a template… */
    templateKey: z.string().max(80).optional(),
    /** …or custom text ({{placeholders}} allowed) */
    title: z.string().max(200).optional(),
    body: z.string().max(2000).optional(),
    buttonLabel: z.string().max(60).optional(),
    buttonUrl: z.string().max(300).optional(),
    channels: z.array(channel).max(6).optional(),
    category: z.enum(['TRANSACTIONAL', 'REMINDER', 'MARKETING']).optional(),
  }),
  z.object({
    type: z.literal('CREATE_TASK'),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    dueInHours: z.number().int().min(0).max(24 * 60).optional(),
    assignToUserId: z.string().uuid().optional(),
  }),
  z.object({ type: z.literal('ADD_TAG'), tagId: z.string().uuid() }),
  z.object({
    type: z.literal('SET_LEAD_STAGE'),
    stage: z.enum(['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'MEMBERSHIP_PURCHASED', 'ACTIVE_CLIENT', 'MEMBERSHIP_EXPIRING', 'RENEWED', 'INACTIVE', 'LOST']),
  }),
]);

export const actionsSchema = z.array(actionSchema).min(1).max(10);
export const conditionsSchema = z.array(segmentRuleSchema).max(10);

export type AutomationAction = z.infer<typeof actionSchema>;

export const TRIGGER_CONFIG_SCHEMAS: Record<AutomationTrigger, z.ZodTypeAny> = {
  CLIENT_REGISTERED: z.object({}).passthrough(),
  TRIAL_ATTENDED: z.object({}).passthrough(),
  TRIAL_NO_SHOW: z.object({}).passthrough(),
  MEMBERSHIP_ACTIVATED: z.object({}).passthrough(),
  MEMBERSHIP_EXPIRING: z.object({ daysBefore: z.number().int().min(0).max(60) }),
  MEMBERSHIP_EXPIRED: z.object({}).passthrough(),
  LOW_VISITS: z.object({ remaining: z.number().int().min(0).max(20) }),
  NO_VISIT_FOR_DAYS: z.object({ days: z.number().int().min(1).max(365) }),
  BOOKING_CREATED: z.object({}).passthrough(),
  BOOKING_CANCELLED: z.object({}).passthrough(),
  NO_SHOW: z.object({}).passthrough(),
  PAYMENT_CONFIRMED: z.object({}).passthrough(),
};

export const TRIGGER_META: Array<{ trigger: AutomationTrigger; label: string; config: string | null; kind: 'event' | 'schedule' }> = [
  { trigger: 'CLIENT_REGISTERED', label: 'Client registered', config: null, kind: 'event' },
  { trigger: 'TRIAL_ATTENDED', label: 'Trial attended', config: null, kind: 'event' },
  { trigger: 'TRIAL_NO_SHOW', label: 'Trial missed', config: null, kind: 'event' },
  { trigger: 'MEMBERSHIP_ACTIVATED', label: 'Membership activated', config: null, kind: 'event' },
  { trigger: 'MEMBERSHIP_EXPIRING', label: 'Membership expires in N days', config: 'daysBefore', kind: 'schedule' },
  { trigger: 'MEMBERSHIP_EXPIRED', label: 'Membership expired', config: null, kind: 'schedule' },
  { trigger: 'LOW_VISITS', label: 'N visits remaining', config: 'remaining', kind: 'schedule' },
  { trigger: 'NO_VISIT_FOR_DAYS', label: 'No visit for N days', config: 'days', kind: 'schedule' },
  { trigger: 'BOOKING_CREATED', label: 'Session booked', config: null, kind: 'event' },
  { trigger: 'BOOKING_CANCELLED', label: 'Booking cancelled', config: null, kind: 'event' },
  { trigger: 'NO_SHOW', label: 'No-show', config: null, kind: 'event' },
  { trigger: 'PAYMENT_CONFIRMED', label: 'Payment confirmed', config: null, kind: 'event' },
];

/** Rules seeded on first start — every one is editable (or can be switched off) in Admin → Automations. */
export const DEFAULT_RULES: Array<{
  key: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  triggerConfig: Record<string, unknown>;
  conditions: unknown[];
  actions: AutomationAction[];
  delayMinutes: number;
  isActive: boolean;
}> = [
  {
    key: 'membership-expiring-7',
    name: 'Membership expires in 7 days',
    description: 'Reminder a week before expiry.',
    trigger: 'MEMBERSHIP_EXPIRING',
    triggerConfig: { daysBefore: 7 },
    conditions: [],
    actions: [{ type: 'SEND_NOTIFICATION', templateKey: 'membership.expiring' }],
    delayMinutes: 0,
    isActive: true,
  },
  {
    key: 'membership-expiring-3',
    name: 'Membership expires in 3 days',
    description: 'Reminder three days before expiry.',
    trigger: 'MEMBERSHIP_EXPIRING',
    triggerConfig: { daysBefore: 3 },
    conditions: [],
    actions: [{ type: 'SEND_NOTIFICATION', templateKey: 'membership.expiring' }],
    delayMinutes: 0,
    isActive: true,
  },
  {
    key: 'membership-expiring-1',
    name: 'Membership expires tomorrow',
    description: 'Last reminder the day before expiry.',
    trigger: 'MEMBERSHIP_EXPIRING',
    triggerConfig: { daysBefore: 1 },
    conditions: [],
    actions: [{ type: 'SEND_NOTIFICATION', templateKey: 'membership.expiring' }],
    delayMinutes: 0,
    isActive: true,
  },
  {
    key: 'membership-expired',
    name: 'Membership expired',
    description: 'Sent when the membership has expired and was not renewed.',
    trigger: 'MEMBERSHIP_EXPIRED',
    triggerConfig: {},
    conditions: [{ field: 'hasActiveMembership', op: 'eq', value: false }],
    actions: [{ type: 'SEND_NOTIFICATION', templateKey: 'membership.expired' }],
    delayMinutes: 0,
    isActive: true,
  },
  {
    key: 'low-visits-2',
    name: '2 visits left',
    description: 'Optional reminder when two visits remain.',
    trigger: 'LOW_VISITS',
    triggerConfig: { remaining: 2 },
    conditions: [],
    actions: [{ type: 'SEND_NOTIFICATION', templateKey: 'membership.low_visits' }],
    delayMinutes: 0,
    isActive: true,
  },
  {
    key: 'low-visits-1',
    name: '1 visit left',
    description: 'Reminder when one visit remains.',
    trigger: 'LOW_VISITS',
    triggerConfig: { remaining: 1 },
    conditions: [],
    actions: [{ type: 'SEND_NOTIFICATION', templateKey: 'membership.low_visits' }],
    delayMinutes: 0,
    isActive: true,
  },
  {
    key: 'low-visits-0',
    name: 'No visits left',
    description: 'Tells the client the membership has no remaining visits.',
    trigger: 'LOW_VISITS',
    triggerConfig: { remaining: 0 },
    conditions: [],
    actions: [{ type: 'SEND_NOTIFICATION', templateKey: 'membership.no_visits' }],
    delayMinutes: 0,
    isActive: true,
  },
  {
    key: 'trial-thank-you',
    name: 'Thank you after the trial',
    description: 'Thanks the client after the trial and invites them to choose a membership.',
    trigger: 'TRIAL_ATTENDED',
    triggerConfig: {},
    conditions: [{ field: 'hasActiveMembership', op: 'eq', value: false }],
    actions: [{ type: 'SEND_NOTIFICATION', templateKey: 'trial.follow_up' }],
    delayMinutes: 30,
    isActive: true,
  },
  {
    key: 'trial-follow-up-task',
    name: 'Follow up 24 h after the trial',
    description: 'If no membership was bought within 24 hours, create a call task.',
    trigger: 'TRIAL_ATTENDED',
    triggerConfig: {},
    conditions: [{ field: 'hasActiveMembership', op: 'eq', value: false }],
    actions: [{ type: 'CREATE_TASK', title: 'Follow up after trial — offer a membership', priority: 'HIGH', dueInHours: 24 }],
    delayMinutes: 24 * 60,
    isActive: true,
  },
  {
    key: 'inactive-14-days',
    name: 'No visit for 14 days',
    description: 'Create a task to ask why the client stopped attending.',
    trigger: 'NO_VISIT_FOR_DAYS',
    triggerConfig: { days: 14 },
    conditions: [{ field: 'hasUpcomingBooking', op: 'eq', value: false }],
    actions: [{ type: 'CREATE_TASK', title: 'Ask why the client stopped attending', priority: 'MEDIUM', dueInHours: 48 }],
    delayMinutes: 0,
    isActive: true,
  },
  {
    key: 'expiring-offer-task',
    name: 'Send membership options before expiry',
    description: 'Create a task for the team three days before a membership expires.',
    trigger: 'MEMBERSHIP_EXPIRING',
    triggerConfig: { daysBefore: 3 },
    conditions: [],
    actions: [{ type: 'CREATE_TASK', title: 'Send membership options', priority: 'MEDIUM', dueInHours: 24 }],
    delayMinutes: 0,
    isActive: false,
  },
];
