import { z } from 'zod';

const clock = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:mm');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #6D28D9');

/**
 * Every admin-editable business rule and content block. Defaults encode the
 * current Talk Club policy; admins change them in Settings without code changes.
 */
export const SETTINGS_SCHEMAS = {
  club: z.object({
    name: z.string().min(1).max(80),
    tagline: z.string().max(160),
    phone: z.string().max(40),
    whatsapp: z.string().max(40),
    email: z.string().max(120),
    instagram: z.string().max(200),
    telegram: z.string().max(200),
    tiktok: z.string().max(200),
    website: z.string().max(200),
    mapProvider: z.enum(['google', '2gis', 'osm']),
  }),
  booking: z.object({
    /** How many days ahead clients can book (0 = no limit). */
    openDaysAhead: z.number().int().min(0).max(180),
    /** Online booking closes N minutes before the start (0 = until the start). */
    cutoffMinutesBeforeStart: z.number().int().min(0).max(1440),
    levelEnforcement: z.enum(['off', 'warn', 'block']),
    /** Levels allowed outside the session's range. */
    levelTolerance: z.number().int().min(0).max(5),
    allowOverlappingBookings: z.boolean(),
  }),
  cancellation: z.object({
    mode: z.enum(['PREVIOUS_DAY_AT', 'HOURS_BEFORE']),
    previousDayTime: clock,
    hoursBefore: z.number().int().min(0).max(168),
    graceMinutesAfterBooking: z.number().int().min(0).max(120),
  }),
  sessions: z.object({
    defaultDurationMinutes: z.number().int().min(15).max(480),
    defaultCapacity: z.number().int().min(1).max(100),
    almostFullThreshold: z.number().int().min(0).max(20),
    generateWeeksAhead: z.number().int().min(1).max(26),
  }),
  memberships: z.object({
    defaultValidityDays: z.number().int().min(1).max(730),
    lowVisitsThreshold: z.number().int().min(0).max(10),
  }),
  trial: z.object({
    enabled: z.boolean(),
    price: z.number().int().min(0).max(1_000_000),
    allowSelfBooking: z.boolean(),
    maxPerClient: z.number().int().min(0).max(10),
  }),
  waitlist: z.object({
    enabled: z.boolean(),
    /** How long a freed seat is reserved for the next person on the waitlist. */
    offerMinutes: z.number().int().min(5).max(1440),
    /** Stop sequential offers this close to the start; the seat opens to everyone instead. */
    stopOffersMinutesBeforeStart: z.number().int().min(0).max(1440),
  }),
  attendance: z.object({
    /** Unmarked bookings are finalised N minutes after the session ends. */
    autoFinalizeAfterMinutes: z.number().int().min(0).max(10_080),
    unmarkedOutcome: z.enum(['NO_SHOW', 'ATTENDED']),
    qrCheckinEnabled: z.boolean(),
    teacherWindowBeforeMinutes: z.number().int().min(0).max(1440),
    teacherWindowAfterMinutes: z.number().int().min(0).max(10_080),
  }),
  feedback: z.object({
    enabled: z.boolean(),
    visibleToClients: z.boolean(),
  }),
  notifications: z.object({
    sessionReminderOffsetsMinutes: z.array(z.number().int().min(10).max(10_080)).max(5),
    adminAlerts: z.object({
      newRegistration: z.boolean(),
      newTrial: z.boolean(),
      paymentReceived: z.boolean(),
      sessionFull: z.boolean(),
      cancellation: z.boolean(),
      noShow: z.boolean(),
      waitlistOpportunity: z.boolean(),
      membershipExpiring: z.boolean(),
      dataRequest: z.boolean(),
    }),
  }),
  crm: z.object({
    expiringSoonDays: z.number().int().min(1).max(60),
    inactiveAfterDays: z.number().int().min(1).max(365),
    newClientDays: z.number().int().min(1).max(90),
    vipVisitsPer30Days: z.number().int().min(1).max(60),
    lostAfterDays: z.number().int().min(1).max(365),
  }),
  referrals: z.object({
    enabled: z.boolean(),
    rewardDescription: z.string().max(500),
  }),
  branding: z.object({
    primaryColor: hexColor,
    accentColor: hexColor,
    logoUrl: z.string().max(500).nullable(),
  }),
  content: z.object({
    about: z.string().max(20_000),
    howItWorks: z.array(z.object({ title: z.string().min(1).max(80), text: z.string().max(400) })).max(10),
    rules: z.string().max(20_000),
    faq: z.array(z.object({ question: z.string().min(1).max(300), answer: z.string().max(3000) })).max(60),
    contactNote: z.string().max(1000),
  }),
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;
export type AllSettings = { [K in SettingsKey]: SettingsValue<K> };

export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingsKey[];

/** Setting groups that are safe to expose to the public client app. */
export const PUBLIC_SETTINGS_KEYS: SettingsKey[] = ['club', 'branding', 'content'];

const DEFAULT_RULES = `### Sessions
- Sessions last **90 minutes**.
- Groups have **up to 7 participants**.
- Please arrive a few minutes early so the session can start on time.

### Memberships
- Memberships are valid for **35 days** from the purchase date.
- Visits can be used at your own pace — there is no weekly minimum.
- Unused visits expire together with the membership.

### Booking & cancellation
- Book sessions in the app; one visit is reserved from your membership when you book.
- You can cancel **free of charge until 20:00 on the day before** the session — the visit returns to your membership.
- A late cancellation (after 20:00 the day before) cancels the booking, but the visit is **not returned**.
- If you don't come and don't cancel, the booking is marked as a **no-show** and the visit is used.

### Attendance
- Administrators may correct attendance manually in exceptional situations (illness, emergencies).
- Please be respectful: Talk Club is a friendly space for everyone to practise speaking.`;

const DEFAULT_ABOUT = `**Talk Club** is an English Speaking Club in Almaty with native English-speaking teachers.

We are not a traditional language school. People come to Talk Club to **speak** — in small, friendly groups of up to seven, with a native speaker guiding the conversation.

- Speak English regularly and build real confidence
- Practise with native speakers from around the world
- Meet other English learners in a relaxed, social atmosphere
- Choose sessions that fit your level and your schedule — no rigid timetable`;

export const DEFAULT_SETTINGS: AllSettings = {
  club: {
    name: 'Talk Club',
    tagline: 'English Speaking Club with native speakers',
    phone: '+7 700 000 00 00',
    whatsapp: '+7 700 000 00 00',
    email: 'hello@talkclub.kz',
    instagram: 'https://instagram.com/talkclub.almaty',
    telegram: '',
    tiktok: '',
    website: '',
    mapProvider: '2gis',
  },
  booking: {
    openDaysAhead: 21,
    cutoffMinutesBeforeStart: 0,
    levelEnforcement: 'block',
    levelTolerance: 1,
    allowOverlappingBookings: false,
  },
  cancellation: {
    mode: 'PREVIOUS_DAY_AT',
    previousDayTime: '20:00',
    hoursBefore: 24,
    graceMinutesAfterBooking: 0,
  },
  sessions: {
    defaultDurationMinutes: 90,
    defaultCapacity: 7,
    almostFullThreshold: 2,
    generateWeeksAhead: 4,
  },
  memberships: {
    defaultValidityDays: 35,
    lowVisitsThreshold: 2,
  },
  trial: {
    enabled: true,
    price: 1500,
    allowSelfBooking: true,
    maxPerClient: 1,
  },
  waitlist: {
    enabled: true,
    offerMinutes: 60,
    stopOffersMinutesBeforeStart: 60,
  },
  attendance: {
    autoFinalizeAfterMinutes: 180,
    unmarkedOutcome: 'NO_SHOW',
    qrCheckinEnabled: true,
    teacherWindowBeforeMinutes: 30,
    teacherWindowAfterMinutes: 1440,
  },
  feedback: {
    enabled: true,
    visibleToClients: true,
  },
  notifications: {
    sessionReminderOffsetsMinutes: [1440, 120],
    adminAlerts: {
      newRegistration: true,
      newTrial: true,
      paymentReceived: true,
      sessionFull: true,
      cancellation: true,
      noShow: true,
      waitlistOpportunity: true,
      membershipExpiring: false,
      dataRequest: true,
    },
  },
  crm: {
    expiringSoonDays: 7,
    inactiveAfterDays: 14,
    newClientDays: 14,
    vipVisitsPer30Days: 8,
    lostAfterDays: 30,
  },
  referrals: {
    enabled: true,
    rewardDescription: '',
  },
  branding: {
    primaryColor: '#6D28D9',
    accentColor: '#C6F432',
    logoUrl: null,
  },
  content: {
    about: DEFAULT_ABOUT,
    howItWorks: [
      { title: 'Choose your level', text: 'Tell us your English level — we will suggest sessions that fit you.' },
      { title: 'Book a session', text: 'Pick a time that suits you. Groups have up to 7 people.' },
      { title: 'Come to Talk Club', text: 'Zheltoksan 118, offices 314–316. Sessions last 90 minutes.' },
      { title: 'Speak English', text: 'A native speaker leads a real conversation. No textbooks, no pressure.' },
      { title: 'Repeat regularly', text: 'Regular practice builds fluency and confidence. Book again in one tap.' },
    ],
    rules: DEFAULT_RULES,
    faq: [
      {
        question: 'Do I need a certain level to join?',
        answer:
          'Sessions run for levels from Elementary to Advanced. Choose your level when you register and we will show sessions that match it.',
      },
      {
        question: 'How long is a membership valid?',
        answer:
          'Every membership is valid for 35 days from the purchase date. You can attend at any rhythm — one session one week and three the next — as long as you have visits left.',
      },
      {
        question: 'What happens if I cancel?',
        answer:
          'Cancel before 20:00 on the day before the session and the visit returns to your membership. Later cancellations and no-shows use the visit.',
      },
      {
        question: 'Can I try a session first?',
        answer: 'Yes! A trial session costs 1,500 KZT. Book it in the app or leave a request and we will contact you.',
      },
      {
        question: 'How do I pay?',
        answer:
          'Choose a membership in the app. You pay by cash or card at the club reception. Your membership is activated as soon as the payment is confirmed.',
      },
      {
        question: 'Who are the teachers?',
        answer: 'All our speaking-club teachers are native English speakers. You can see their profiles in the app.',
      },
    ],
    contactNote: 'Write to us on WhatsApp or Instagram — we usually reply within an hour during working hours.',
  },
};
