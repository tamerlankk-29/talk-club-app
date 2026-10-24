import { z } from 'zod';

/**
 * Declarative client filters shared by segments, broadcasts, announcements and
 * automation conditions. Stored as JSON: { match: "all" | "any", rules: [...] }.
 */
const categories = z.enum(['ADULT', 'TEEN', 'CHILD', 'BUSINESS', 'INDIVIDUAL']);
const formats = z.enum(['OFFLINE', 'ONLINE', 'ANY']);
const stages = z.enum([
  'NEW_LEAD',
  'CONTACTED',
  'INTERESTED',
  'TRIAL_BOOKED',
  'TRIAL_ATTENDED',
  'MEMBERSHIP_PURCHASED',
  'ACTIVE_CLIENT',
  'MEMBERSHIP_EXPIRING',
  'RENEWED',
  'INACTIVE',
  'LOST',
]);
const days = z.number().int().min(0).max(3650);
const ids = z.array(z.string().uuid()).min(1).max(200);

export const segmentRuleSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('membershipStatus'), op: z.literal('eq'), value: z.enum(['ACTIVE', 'NONE', 'EXPIRED']) }),
  z.object({ field: z.literal('hasActiveMembership'), op: z.literal('eq'), value: z.boolean() }),
  z.object({ field: z.literal('membershipExpiresInDays'), op: z.literal('lte'), value: days }),
  z.object({ field: z.literal('membershipExpiredDaysAgo'), op: z.literal('gte'), value: days }),
  z.object({ field: z.literal('visitsRemaining'), op: z.enum(['lte', 'gte', 'eq']), value: z.number().int().min(0).max(500) }),
  z.object({ field: z.literal('daysSinceLastVisit'), op: z.enum(['gte', 'lte']), value: days }),
  z.object({ field: z.literal('neverVisited'), op: z.literal('eq'), value: z.boolean() }),
  z.object({ field: z.literal('registeredWithinDays'), op: z.literal('lte'), value: days }),
  z.object({ field: z.literal('visitsLast30Days'), op: z.enum(['gte', 'lte']), value: z.number().int().min(0).max(100) }),
  z.object({ field: z.literal('hasUpcomingBooking'), op: z.literal('eq'), value: z.boolean() }),
  z.object({ field: z.literal('trialCompletedNoMembership'), op: z.literal('eq'), value: z.boolean() }),
  z.object({ field: z.literal('category'), op: z.literal('in'), value: z.array(categories).min(1) }),
  z.object({ field: z.literal('formatPreference'), op: z.literal('in'), value: z.array(formats).min(1) }),
  z.object({ field: z.literal('levelId'), op: z.literal('in'), value: ids }),
  z.object({ field: z.literal('teacherId'), op: z.literal('in'), value: ids }),
  z.object({ field: z.literal('tagId'), op: z.literal('in'), value: ids }),
  z.object({ field: z.literal('sourceId'), op: z.literal('in'), value: ids }),
  z.object({ field: z.literal('leadStage'), op: z.literal('in'), value: z.array(stages).min(1) }),
  z.object({ field: z.literal('marketingConsent'), op: z.literal('eq'), value: z.boolean() }),
]);

export const segmentDefinitionSchema = z.object({
  match: z.enum(['all', 'any']).default('all'),
  rules: z.array(segmentRuleSchema).max(20).default([]),
});

export type SegmentRule = z.infer<typeof segmentRuleSchema>;
export type SegmentDefinition = z.infer<typeof segmentDefinitionSchema>;

/** Human-readable rule labels for the admin UI. */
export const SEGMENT_FIELDS: Array<{ field: SegmentRule['field']; label: string; ops: string[]; valueType: string }> = [
  { field: 'membershipStatus', label: 'Membership status', ops: ['eq'], valueType: 'enum:ACTIVE,NONE,EXPIRED' },
  { field: 'hasActiveMembership', label: 'Has an active membership', ops: ['eq'], valueType: 'boolean' },
  { field: 'membershipExpiresInDays', label: 'Membership expires within (days)', ops: ['lte'], valueType: 'number' },
  { field: 'membershipExpiredDaysAgo', label: 'Membership expired at least (days ago)', ops: ['gte'], valueType: 'number' },
  { field: 'visitsRemaining', label: 'Visits remaining', ops: ['lte', 'gte', 'eq'], valueType: 'number' },
  { field: 'daysSinceLastVisit', label: 'Days since last visit', ops: ['gte', 'lte'], valueType: 'number' },
  { field: 'neverVisited', label: 'Never attended a session', ops: ['eq'], valueType: 'boolean' },
  { field: 'registeredWithinDays', label: 'Registered within (days)', ops: ['lte'], valueType: 'number' },
  { field: 'visitsLast30Days', label: 'Visits in the last 30 days', ops: ['gte', 'lte'], valueType: 'number' },
  { field: 'hasUpcomingBooking', label: 'Has an upcoming booking', ops: ['eq'], valueType: 'boolean' },
  { field: 'trialCompletedNoMembership', label: 'Attended a trial, no membership yet', ops: ['eq'], valueType: 'boolean' },
  { field: 'category', label: 'Client type', ops: ['in'], valueType: 'enum[]:ADULT,TEEN,CHILD,BUSINESS,INDIVIDUAL' },
  { field: 'formatPreference', label: 'Offline / online preference', ops: ['in'], valueType: 'enum[]:OFFLINE,ONLINE,ANY' },
  { field: 'levelId', label: 'English level', ops: ['in'], valueType: 'level[]' },
  { field: 'teacherId', label: 'Attended sessions with teacher', ops: ['in'], valueType: 'teacher[]' },
  { field: 'tagId', label: 'Has tag', ops: ['in'], valueType: 'tag[]' },
  { field: 'sourceId', label: 'Lead source', ops: ['in'], valueType: 'source[]' },
  { field: 'leadStage', label: 'CRM stage', ops: ['in'], valueType: 'stage[]' },
  { field: 'marketingConsent', label: 'Accepts marketing messages', ops: ['eq'], valueType: 'boolean' },
];

/** Built-in segments (keys are stable; admins can tune the numbers). */
export const SYSTEM_SEGMENTS: Array<{ key: string; name: string; description: string; definition: SegmentDefinition }> = [
  { key: 'ALL', name: 'All clients', description: 'Everyone with an active client profile.', definition: { match: 'all', rules: [] } },
  {
    key: 'ACTIVE',
    name: 'Active',
    description: 'Current membership is active.',
    definition: { match: 'all', rules: [{ field: 'membershipStatus', op: 'eq', value: 'ACTIVE' }] },
  },
  {
    key: 'EXPIRING_SOON',
    name: 'Expiring soon',
    description: 'Membership expires within 7 days.',
    definition: { match: 'all', rules: [{ field: 'membershipExpiresInDays', op: 'lte', value: 7 }] },
  },
  {
    key: 'EXPIRED',
    name: 'Expired memberships',
    description: 'Had a membership, none active now.',
    definition: { match: 'all', rules: [{ field: 'membershipStatus', op: 'eq', value: 'EXPIRED' }] },
  },
  {
    key: 'INACTIVE',
    name: 'Inactive',
    description: 'No attendance for 14 days.',
    definition: { match: 'all', rules: [{ field: 'daysSinceLastVisit', op: 'gte', value: 14 }] },
  },
  {
    key: 'TRIAL',
    name: 'Trial — not converted',
    description: 'Attended a trial but has not bought a membership.',
    definition: { match: 'all', rules: [{ field: 'trialCompletedNoMembership', op: 'eq', value: true }] },
  },
  {
    key: 'NEW',
    name: 'New',
    description: 'Registered in the last 14 days.',
    definition: { match: 'all', rules: [{ field: 'registeredWithinDays', op: 'lte', value: 14 }] },
  },
  {
    key: 'VIP',
    name: 'VIP / high frequency',
    description: '8 or more visits in the last 30 days.',
    definition: { match: 'all', rules: [{ field: 'visitsLast30Days', op: 'gte', value: 8 }] },
  },
  {
    key: 'LOST',
    name: 'Lost',
    description: 'Membership expired 30+ days ago and not renewed.',
    definition: { match: 'all', rules: [{ field: 'membershipExpiredDaysAgo', op: 'gte', value: 30 }] },
  },
];
