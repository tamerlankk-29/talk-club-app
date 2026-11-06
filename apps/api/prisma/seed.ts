/**
 * Demo data for development — NOT for production.
 *
 * Instead of inserting fake rows, this script replays ~5 weeks of club life
 * through the real services with a simulated clock: registrations, Kaspi/cash
 * payments, bookings, on-time and late cancellations, teacher attendance,
 * no-shows, renewals, feedback, trials, waitlists and CRM activity. Every
 * balance, ledger entry and statistic is therefore genuinely consistent.
 *
 * Demo accounts (development only — change or delete before going live):
 *   Staff (email + password "TalkClub2026!"):
 *     owner@talkclub.kz      Super admin
 *     admin@talkclub.kz      Admin
 *     manager@talkclub.kz    Manager
 *     marketing@talkclub.kz  Marketing
 *     michael@talkclub.kz    Teacher (Michael)
 *     kevin@talkclub.kz      Teacher (Kevin)
 *   Client: phone +7 701 555 01 01 (SMS code is shown in dev mode)
 *           or tamerlan@example.com + password "Client2026!"
 *   Parent with a child profile: +7 701 555 01 10 / aigerim@example.com + "Client2026!"
 */
import 'dotenv/config';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClientCategory, FormatPreference, TimeOfDay } from '@prisma/client';
import { DateTime } from 'luxon';

const TZ = 'Asia/Almaty';
const STAFF_PASSWORD = 'TalkClub2026!';
const CLIENT_PASSWORD = 'Client2026!';

// Deterministic pseudo-random numbers so every seed run produces the same club.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261001);
const chance = (p: number) => rand() < p;
const pickOne = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
const shuffle = <T>(items: T[]): T[] => [...items].sort(() => rand() - 0.5);

async function main(): Promise<void> {
  process.env.JOBS_ENABLED = 'false';
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    await seed(app);
  } finally {
    await app.close();
  }
}

async function seed(app: INestApplicationContext): Promise<void> {
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const { ClockService } = await import('../src/common/clock/clock.service');
  const { ensureBaseline } = await import('../src/database/baseline');
  const { hashPassword } = await import('../src/modules/auth/password');
  const { AuthContextService } = await import('../src/modules/auth/auth-context.service');
  const { PaymentsService } = await import('../src/modules/payments/payments.service');
  const { BookingsService } = await import('../src/modules/bookings/bookings.service');
  const { AttendanceService } = await import('../src/modules/attendance/attendance.service');
  const { FeedbackService } = await import('../src/modules/feedback/feedback.service');
  const { SessionsService } = await import('../src/modules/sessions/sessions.service');
  const { TrialsService } = await import('../src/modules/trials/trials.service');
  const { CrmService } = await import('../src/modules/crm/crm.service');
  const { PipelineService } = await import('../src/modules/crm/pipeline.service');
  const { AnnouncementsService } = await import('../src/modules/marketing/announcements.service');
  const { BroadcastsService } = await import('../src/modules/marketing/broadcasts.service');
  const { AutomationsService } = await import('../src/modules/automations/automations.service');
  const { WaitlistService } = await import('../src/modules/waitlist/waitlist.service');
  const { ReferralsService } = await import('../src/modules/referrals/referrals.service');
  const { MembershipsService } = await import('../src/modules/memberships/memberships.service');
  const { SegmentsService } = await import('../src/modules/segments/segments.service');
  const { ROLE_KEYS } = await import('../src/modules/rbac/permissions');

  const prisma = app.get(PrismaService);
  const clock = app.get(ClockService);
  const authContext = app.get(AuthContextService);
  const payments = app.get(PaymentsService);
  const bookings = app.get(BookingsService);
  const attendance = app.get(AttendanceService);
  const feedback = app.get(FeedbackService);
  const sessions = app.get(SessionsService);
  const trials = app.get(TrialsService);
  const crm = app.get(CrmService);
  const pipeline = app.get(PipelineService);
  const announcements = app.get(AnnouncementsService);
  const broadcasts = app.get(BroadcastsService);
  const automations = app.get(AutomationsService);
  const waitlist = app.get(WaitlistService);
  const referrals = app.get(ReferralsService);
  const memberships = app.get(MembershipsService);
  const segments = app.get(SegmentsService);

  if (process.argv.includes('--reset')) await resetDevelopmentData(prisma);
  if (await prisma.user.findUnique({ where: { email: 'owner@talkclub.kz' } })) {
    console.log('Demo data is already present. Run "npm run db:reseed" to regenerate it.');
    return;
  }

  // ─── Simulated clock with checkpoints (used to align created_at afterwards) ───
  const checkpoints: Array<{ real: Date; sim: Date }> = [];
  const travel = (sim: Date | DateTime) => {
    const date = sim instanceof Date ? sim : sim.toJSDate();
    clock.set(date);
    checkpoints.push({ real: new Date(), sim: date });
  };
  const realNow = DateTime.now().setZone(TZ);
  const start = realNow.startOf('week').minus({ weeks: 5 }).set({ hour: 9 });
  travel(start.minus({ days: 3 }));

  console.log('• Reference data');
  const base = await ensureBaseline(prisma);
  await prisma.membershipPlan.upsert({
    where: { programId_code: { programId: base.programId, code: 'BUSINESS' } },
    create: {
      programId: base.programId,
      code: 'BUSINESS',
      name: 'BUSINESS CLUB',
      description: 'Eight Business Club sessions: meetings, negotiations, presentations and networking in English.',
      visits: 8,
      price: 32_000,
      validityDays: 35,
      clientCategories: ['ADULT', 'BUSINESS'],
      sortOrder: 4,
      groupTypes: { create: { groupTypeId: base.groupTypes.business } },
    },
    update: {},
  });
  await prisma.program.upsert({
    where: { slug: 'math-club' },
    create: { slug: 'math-club', name: 'Math Club', description: 'Future program — hidden from clients until launch.', color: '#0EA5E9', isActive: false, isVisibleToClients: false, sortOrder: 1 },
    update: {},
  });

  // ─── Staff ───
  console.log('• Staff accounts');
  const passwordHash = await hashPassword(STAFF_PASSWORD);
  const roleId = async (key: string) => (await prisma.role.findUniqueOrThrow({ where: { key } })).id;
  const staffUser = async (email: string, displayName: string, roles: string[], phone?: string) =>
    prisma.user.create({
      data: {
        email,
        displayName,
        phone,
        passwordHash,
        roles: { create: await Promise.all(roles.map(async (r) => ({ roleId: await roleId(r) }))) },
      },
    });
  const owner = await staffUser('owner@talkclub.kz', 'Aida (Owner)', [ROLE_KEYS.SUPER_ADMIN]);
  const adminUser = await staffUser('admin@talkclub.kz', 'Dana (Admin)', [ROLE_KEYS.ADMIN]);
  await staffUser('manager@talkclub.kz', 'Aliya (Front desk)', [ROLE_KEYS.MANAGER]);
  await staffUser('marketing@talkclub.kz', 'Marat (Marketing)', [ROLE_KEYS.MARKETING]);
  const admin = (await authContext.load(adminUser.id, null)).user!;
  void owner;

  // ─── Teachers ───
  console.log('• Teachers');
  const L = base.levels;
  const teacherDefs = [
    { key: 'michael', firstName: 'Michael', lastName: 'Carter', country: 'USA', from: 'Elementary', to: 'Intermediate', login: true, headline: 'Native English Speaker · Speaking Club', bio: 'Michael is from Chicago and has been teaching conversational English for eight years. He loves debates about films, travel and technology.', specialization: 'Speaking Club, pronunciation' },
    { key: 'kevin', firstName: 'Kevin', lastName: 'Brooks', country: 'United Kingdom', from: 'Intermediate', to: 'Advanced', login: true, headline: 'Native English Speaker · IELTS speaking', bio: 'Kevin grew up in Manchester. He helps students sound natural and confident, with a special focus on IELTS speaking topics.', specialization: 'Speaking Club, IELTS speaking' },
    { key: 'haven', firstName: 'Haven', lastName: 'Miller', country: 'Canada', from: 'Pre-Intermediate', to: 'Upper-Intermediate', login: false, headline: 'Native English Speaker · Speaking Club', bio: 'Haven is from Vancouver. Expect games, role-plays and lots of laughter — and a lot of speaking time for everyone.', specialization: 'Speaking Club, idioms and slang' },
    { key: 'dante', firstName: 'Dante', lastName: 'Rossi', country: 'Australia', from: 'Upper-Intermediate', to: 'Advanced', login: false, headline: 'Native English Speaker · Business English', bio: 'Dante spent ten years in consulting in Sydney. He runs the Business Club: meetings, negotiations and presentations.', specialization: 'Business Club' },
    { key: 'sarah', firstName: 'Sarah', lastName: "O'Neill", country: 'Ireland', from: 'Beginner', to: 'Pre-Intermediate', login: false, headline: 'Native English Speaker · Kids & Teens', bio: 'Sarah makes English fun for younger learners with storytelling and games.', specialization: 'Teens Club, Kids Club' },
    { key: 'james', firstName: 'James', lastName: 'Walker', country: 'USA', from: 'Intermediate', to: 'Advanced', login: false, headline: 'Native English Speaker · Online sessions', bio: 'James joined Talk Club this month and leads our online Speaking Club sessions.', specialization: 'Online Speaking Club' },
  ];
  const teachers: Record<string, { id: string; userId: string | null }> = {};
  for (const [index, t] of teacherDefs.entries()) {
    const user = t.login ? await staffUser(`${t.key}@talkclub.kz`, `${t.firstName} ${t.lastName}`, [ROLE_KEYS.TEACHER]) : null;
    const row = await prisma.teacher.create({
      data: {
        firstName: t.firstName,
        lastName: t.lastName,
        userId: user?.id ?? null,
        country: t.country,
        nativeLanguage: 'English',
        englishLevel: 'Native',
        headline: t.headline,
        bio: t.bio,
        specialization: t.specialization,
        levelFromId: L[t.from],
        levelToId: L[t.to],
        sessionRate: 8000 + index * 500,
        sortOrder: index,
        availability: [1, 2, 3, 4, 5, 6].map((day) => ({ day, from: '12:30', to: '20:00' })),
      },
    });
    teachers[t.key] = { id: row.id, userId: user?.id ?? null };
  }
  const teacherActor = async (key: string) => (teachers[key].userId ? (await authContext.load(teachers[key].userId!, null)).user! : admin);

  // ─── Weekly schedule (recurring templates) ───
  console.log('• Recurring schedule');
  const R = base.rooms;
  const G = base.groupTypes;
  const validFrom = start.toISODate() as string;
  const templateDefs = [
    { teacher: 'michael', days: [1, 3, 5], time: '13:00', room: R['314'], min: 'Elementary', max: 'Pre-Intermediate', group: G.speaking },
    { teacher: 'haven', days: [1, 3], time: '15:00', room: R['316'], min: 'Pre-Intermediate', max: null, group: G.speaking },
    { teacher: 'sarah', days: [2, 4], time: '15:00', room: R['315'], min: null, max: null, group: G.teens, title: 'Teens Club' },
    { teacher: 'sarah', days: [6], time: '12:30', room: R['316'], min: null, max: null, group: G.kids, title: 'Kids Club' },
    { teacher: 'kevin', days: [2, 4, 6], time: '16:45', room: R['314'], min: 'Intermediate', max: 'Upper-Intermediate', group: G.speaking },
    { teacher: 'michael', days: [1], time: '18:30', room: R['314'], min: 'Pre-Intermediate', max: null, group: G.speaking },
    { teacher: 'michael', days: [3, 5], time: '18:30', room: R['314'], min: 'Intermediate', max: 'Intermediate', group: G.speaking },
    { teacher: 'haven', days: [1, 3, 5], time: '18:30', room: R['315'], min: 'Upper-Intermediate', max: 'Advanced', group: G.speaking },
    { teacher: 'dante', days: [2, 4], time: '18:30', room: R['316'], min: 'Upper-Intermediate', max: null, group: G.business, title: 'Business Club' },
    { teacher: 'kevin', days: [6], time: '14:30', room: R['315'], min: 'Advanced', max: null, group: G.speaking, title: 'Advanced Discussion' },
    { teacher: 'james', days: [2, 4], time: '13:00', room: null, min: 'Intermediate', max: null, group: G.speaking, title: 'Online Speaking Club', online: true },
  ];
  for (const t of templateDefs) {
    await sessions.createTemplate(
      {
        teacherId: teachers[t.teacher].id,
        roomId: t.room,
        groupTypeId: t.group,
        levelMinId: t.min ? L[t.min] : null,
        levelMaxId: t.max ? L[t.max] : null,
        title: t.title ?? null,
        daysOfWeek: t.days,
        startTime: t.time,
        durationMinutes: 90,
        capacity: 7,
        format: t.online ? 'ONLINE' : 'OFFLINE',
        onlineUrl: t.online ? 'https://meet.google.com/talk-club-online' : null,
        validFrom,
      },
      admin,
    );
  }
  for (let w = 0; w <= 5; w += 1) {
    travel(start.plus({ weeks: w }).minus({ days: 1 }));
    await sessions.generateAll();
  }

  // ─── Clients ───
  console.log('• Clients');
  interface DemoClient {
    key: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    level: string;
    category?: ClientCategory;
    days?: number[];
    times?: TimeOfDay[];
    format?: FormatPreference;
    source: string;
    registerDaysAgo: number;
    account?: boolean;
    password?: boolean;
    marketing?: boolean;
    activity: number; // 0..1 how often they come
  }
  const people: DemoClient[] = [
    { key: 'tamerlan', firstName: 'Tamerlan', lastName: 'Kazmukhan', phone: '+77015550101', email: 'tamerlan@example.com', level: 'Intermediate', days: [1, 3, 6], times: ['EVENING'], source: 'INSTAGRAM', registerDaysAgo: 30, account: true, password: true, marketing: true, activity: 0.5 },
    { key: 'anna', firstName: 'Anna', lastName: 'Sokolova', phone: '+77015550102', email: 'anna@example.com', level: 'Upper-Intermediate', days: [1, 3, 5], times: ['EVENING'], source: 'REFERRAL', registerDaysAgo: 34, account: true, marketing: true, activity: 0.95 },
    { key: 'diana', firstName: 'Diana', lastName: 'Akhmetova', phone: '+77015550103', email: 'diana@example.com', level: 'Intermediate', days: [2, 4], times: ['EVENING'], source: 'REFERRAL', registerDaysAgo: 33, account: true, marketing: true, activity: 0.5 },
    { key: 'alex', firstName: 'Alex', lastName: 'Petrov', phone: '+77015550104', level: 'Intermediate', days: [2, 4, 6], times: ['AFTERNOON', 'EVENING'], source: 'TIKTOK', registerDaysAgo: 29, account: true, marketing: false, activity: 0.8 },
    { key: 'maria', firstName: 'Maria', lastName: 'Ivanova', phone: '+77015550105', level: 'Pre-Intermediate', days: [1, 3], times: ['AFTERNOON'], source: 'WEBSITE', registerDaysAgo: 50, account: true, marketing: true, activity: 0.4 },
    { key: 'timur', firstName: 'Timur', lastName: 'Nurlanov', phone: '+77015550106', email: 'timur@example.com', level: 'Upper-Intermediate', category: 'BUSINESS', days: [2, 4], times: ['EVENING'], source: 'ADVERTISEMENT', registerDaysAgo: 26, account: true, marketing: true, activity: 0.7 },
    { key: 'madina', firstName: 'Madina', lastName: 'Zhaksylykova', phone: '+77015550107', level: 'Elementary', days: [1, 3, 5], times: ['AFTERNOON'], source: 'INSTAGRAM', registerDaysAgo: 3, account: true, marketing: true, activity: 0 },
    { key: 'daniyar', firstName: 'Daniyar', lastName: 'Tulegenov', phone: '+77015550108', level: 'Pre-Intermediate', days: [1, 3], times: ['EVENING'], source: 'TIKTOK', registerDaysAgo: 9, account: true, marketing: true, activity: 0 },
    { key: 'aruzhan', firstName: 'Aruzhan', lastName: 'Bekova', phone: '+77015550109', level: 'Intermediate', days: [2, 4], times: ['EVENING'], source: 'INSTAGRAM', registerDaysAgo: 1, account: true, marketing: true, activity: 0 },
    { key: 'aigerim', firstName: 'Aigerim', lastName: 'Serikova', phone: '+77015550110', email: 'aigerim@example.com', level: 'Advanced', days: [6], times: ['AFTERNOON'], source: 'REFERRAL', registerDaysAgo: 20, account: true, password: true, marketing: true, activity: 0.5 },
    { key: 'nurlan', firstName: 'Nurlan', lastName: 'Mukanov', phone: '+77015550111', level: 'Intermediate', days: [3, 5], times: ['EVENING'], source: 'WALK_IN', registerDaysAgo: 31, account: true, marketing: false, activity: 0.6 },
    { key: 'dinara', firstName: 'Dinara', lastName: 'Kassymova', phone: '+77015550112', level: 'Upper-Intermediate', days: [1, 5], times: ['EVENING'], source: 'INSTAGRAM', registerDaysAgo: 28, account: true, marketing: true, activity: 0.6 },
    { key: 'ivan', firstName: 'Ivan', lastName: 'Popov', phone: '+77015550113', level: 'Advanced', days: [6], times: ['AFTERNOON'], source: 'WEBSITE', registerDaysAgo: 27, account: true, marketing: false, activity: 0.7 },
    { key: 'olga', firstName: 'Olga', lastName: 'Volkova', phone: '+77015550114', level: 'Elementary', days: [1, 3, 5], times: ['AFTERNOON'], source: 'REFERRAL', registerDaysAgo: 25, account: true, marketing: true, activity: 0.7 },
    { key: 'asel', firstName: 'Asel', lastName: 'Tokhtarova', phone: '+77015550115', level: 'Pre-Intermediate', days: [1, 3], times: ['AFTERNOON'], source: 'INSTAGRAM', registerDaysAgo: 24, account: true, marketing: true, activity: 0.6 },
    { key: 'yerlan', firstName: 'Yerlan', lastName: 'Baimukhanov', phone: '+77015550116', level: 'Upper-Intermediate', category: 'BUSINESS', days: [2, 4], times: ['EVENING'], source: 'ADVERTISEMENT', registerDaysAgo: 23, account: true, marketing: true, activity: 0.6 },
    { key: 'kamila', firstName: 'Kamila', lastName: 'Rakhimova', phone: '+77015550117', level: 'Intermediate', days: [2, 4, 6], times: ['AFTERNOON'], source: 'TIKTOK', registerDaysAgo: 22, account: true, marketing: true, activity: 0.7 },
    { key: 'sanzhar', firstName: 'Sanzhar', lastName: 'Omarov', phone: '+77015550118', level: 'Elementary', days: [1, 5], times: ['AFTERNOON'], source: 'WALK_IN', registerDaysAgo: 21, account: false, marketing: false, activity: 0.5 },
    { key: 'alina', firstName: 'Alina', lastName: 'Gordeeva', phone: '+77015550119', level: 'Upper-Intermediate', days: [1, 3, 5], times: ['EVENING'], source: 'INSTAGRAM', registerDaysAgo: 19, account: true, marketing: true, activity: 0.8 },
    { key: 'bekzat', firstName: 'Bekzat', lastName: 'Utegenov', phone: '+77015550120', level: 'Intermediate', format: 'ONLINE', days: [2, 4], times: ['AFTERNOON'], source: 'WEBSITE', registerDaysAgo: 18, account: true, marketing: true, activity: 0.7 },
    { key: 'dariya', firstName: 'Dariya', lastName: 'Lee', phone: '+77015550121', level: 'Pre-Intermediate', days: [1, 3], times: ['AFTERNOON'], source: 'REFERRAL', registerDaysAgo: 17, account: true, marketing: true, activity: 0.5 },
    { key: 'adil', firstName: 'Adil', lastName: 'Sagyndykov', phone: '+77015550122', level: 'Intermediate', days: [3, 5], times: ['EVENING'], source: 'INSTAGRAM', registerDaysAgo: 16, account: true, marketing: true, activity: 0.6 },
    { key: 'zarina', firstName: 'Zarina', lastName: 'Mamyrova', phone: '+77015550123', level: 'Pre-Intermediate', category: 'TEEN', days: [2, 4], times: ['AFTERNOON'], source: 'INSTAGRAM', registerDaysAgo: 15, account: true, marketing: true, activity: 0.7 },
    { key: 'ruslan', firstName: 'Ruslan', lastName: 'Khamitov', phone: '+77015550124', level: 'Elementary', category: 'TEEN', days: [2, 4], times: ['AFTERNOON'], source: 'REFERRAL', registerDaysAgo: 14, account: true, marketing: true, activity: 0.6 },
    { key: 'saule', firstName: 'Saule', lastName: 'Abenova', phone: '+77015550125', level: 'Advanced', days: [6], times: ['AFTERNOON'], source: 'EXISTING_CLIENT', registerDaysAgo: 34, account: true, marketing: true, activity: 0.3 },
    { key: 'arman', firstName: 'Arman', lastName: 'Zhunusov', phone: '+77015550126', level: 'Intermediate', format: 'ONLINE', days: [2, 4], times: ['AFTERNOON'], source: 'WEBSITE', registerDaysAgo: 12, account: true, marketing: false, activity: 0.6 },
    { key: 'ainur', firstName: 'Ainur', lastName: 'Dzhaksybekova', phone: '+77015550127', level: 'Upper-Intermediate', days: [1, 3, 5], times: ['EVENING'], source: 'INSTAGRAM', registerDaysAgo: 11, account: true, marketing: true, activity: 0.7 },
    { key: 'dmitriy', firstName: 'Dmitriy', lastName: 'Smirnov', phone: '+77015550128', level: 'Upper-Intermediate', category: 'BUSINESS', days: [2, 4], times: ['EVENING'], source: 'ADVERTISEMENT', registerDaysAgo: 30, account: true, marketing: true, activity: 0.3 },
    { key: 'karina', firstName: 'Karina', lastName: 'Yessenova', phone: '+77015550129', level: 'Intermediate', days: [2, 4, 6], times: ['EVENING'], source: 'TIKTOK', registerDaysAgo: 8, account: true, marketing: true, activity: 0.7 },
    { key: 'maksat', firstName: 'Maksat', lastName: 'Iskakov', phone: '+77015550130', level: 'Pre-Intermediate', days: [1, 3, 5], times: ['EVENING'], source: 'REFERRAL', registerDaysAgo: 7, account: true, marketing: true, activity: 0.6 },
  ];

  // A few dozen more members with varied levels, schedules and plans.
  const extraFirst = ['Aizhan', 'Bauyrzhan', 'Elena', 'Galym', 'Inkar', 'Kairat', 'Laura', 'Miras', 'Nazira', 'Oleg', 'Perizat', 'Rustem', 'Sabina', 'Talgat', 'Ulzhan', 'Vladislav', 'Yana', 'Zhanna', 'Azamat', 'Balnur', 'Damir', 'Elvira', 'Farida', 'Gani'];
  // Surnames agree with the gender of the first name at the same index.
  const extraLast = ['Abdrakhmanova', 'Beisenov', 'Chernova', 'Dauletov', 'Ermekova', 'Fedorov', 'Gabdullina', 'Ismailov', 'Kenzhebek', 'Lukpanov', 'Moldakhmet', 'Nurpeisov', 'Orazbekova', 'Pak', 'Rakhmetova', 'Sadykov', 'Tasmagambet', 'Umarova', 'Volkov', 'Zhumabek', 'Amanov', 'Bekturova', 'Dzhumabaeva', 'Esenov'];
  const levelNames = ['Elementary', 'Pre-Intermediate', 'Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced'];
  const sourceCodes = ['INSTAGRAM', 'INSTAGRAM', 'TIKTOK', 'REFERRAL', 'WEBSITE', 'WALK_IN', 'ADVERTISEMENT'];
  extraFirst.forEach((firstName, i) => {
    const evening = chance(0.65);
    people.push({
      key: `member${i}`,
      firstName,
      lastName: extraLast[i],
      phone: `+7701555${String(1100 + i)}`,
      level: pickOne(levelNames),
      days: shuffle([1, 2, 3, 4, 5, 6]).slice(0, 2 + Math.floor(rand() * 2)).sort(),
      times: evening ? ['EVENING'] : ['AFTERNOON'],
      source: pickOne(sourceCodes),
      registerDaysAgo: 5 + Math.floor(rand() * 30),
      account: chance(0.9),
      marketing: chance(0.75),
      activity: 0.45 + rand() * 0.5,
    });
  });

  const clientRole = await roleId(ROLE_KEYS.CLIENT);
  const clientPasswordHash = await hashPassword(CLIENT_PASSWORD);
  const clients: Record<string, { id: string; userId: string | null; def: DemoClient }> = {};
  const sources = await prisma.leadSource.findMany();
  for (const p of [...people].sort((a, b) => b.registerDaysAgo - a.registerDaysAgo)) {
    travel(realNow.minus({ days: p.registerDaysAgo }).set({ hour: 10 + Math.floor(rand() * 9), minute: Math.floor(rand() * 60) }));
    const user =
      p.account === false
        ? null
        : await prisma.user.create({
            data: {
              phone: p.phone,
              email: p.email ?? null,
              displayName: `${p.firstName} ${p.lastName}`,
              passwordHash: p.password ? clientPasswordHash : null,
              phoneVerifiedAt: clock.now(),
              roles: { create: { roleId: clientRole } },
            },
          });
    const client = await prisma.client.create({
      data: {
        userId: user?.id ?? null,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email ?? null,
        category: p.category ?? 'ADULT',
        levelId: L[p.level],
        preferredDays: p.days ?? [],
        preferredTimes: p.times ?? [],
        formatPreference: p.format ?? 'ANY',
        marketingConsent: p.marketing ?? false,
        marketingConsentAt: p.marketing ? clock.now() : null,
        sourceId: sources.find((s) => s.code === p.source)?.id ?? null,
      },
    });
    await prisma.clientLevel.create({ data: { clientId: client.id, levelId: L[p.level], reason: 'Self-assessed at registration' } });
    await prisma.clientActivity.create({
      data: { clientId: client.id, type: 'client.registered', title: user ? 'Registered in the Talk Club app' : 'Client created at the front desk' },
    });
    if (user) {
      for (const type of ['TERMS', 'PRIVACY_POLICY'] as const) {
        const doc = await prisma.legalDocument.findFirstOrThrow({ where: { type, isCurrent: true } });
        await prisma.agreementAcceptance.create({
          data: { userId: user.id, clientId: client.id, documentId: doc.id, documentType: type, documentVersion: doc.version, context: 'REGISTRATION', ip: '127.0.0.1', userAgent: 'Demo seed' },
        });
      }
    }
    await referrals.ensureCode(prisma, client.id, p.firstName);
    await pipeline.ensureLead(client.id);
    clients[p.key] = { id: client.id, userId: user?.id ?? null, def: p };
  }
  await prisma.referralCode.update({ where: { clientId: clients.tamerlan.id }, data: { code: 'TAMERLAN10' } });
  await referrals.applyCode(prisma, clients.diana.id, 'TAMERLAN10');
  await referrals.applyCode(prisma, clients.maksat.id, 'TAMERLAN10');

  // Child profile managed by a parent
  const aru = await prisma.client.create({
    data: { firstName: 'Aru', lastName: 'Serikova', category: 'CHILD', levelId: L.Beginner, birthDate: new Date('2016-05-12T00:00:00Z') },
  });
  await prisma.clientGuardian.create({ data: { guardianUserId: clients.aigerim.userId!, clientId: aru.id, relationship: 'mother' } });
  await pipeline.ensureLead(aru.id);

  // ─── Purchases helper (payments confirmed through the real flow) ───
  const plans = await prisma.membershipPlan.findMany();
  const planId = (code: string) => plans.find((p) => p.code === code)!.id;
  const buy = async (clientId: string, code: string, at: DateTime, method: 'KASPI' | 'CASH' | 'ONLINE' | 'CARD' = 'KASPI') => {
    travel(at);
    const payment = await payments.createRequest(
      { clientId, productType: 'MEMBERSHIP', planId: planId(code), methodCode: method, reference: method === 'KASPI' ? `KSP-${Math.floor(100000 + rand() * 899999)}` : undefined },
      admin,
    );
    travel(at.plus({ minutes: 20 + Math.floor(rand() * 90) }));
    await payments.confirm(payment.id, {}, admin);
    return payment.id;
  };

  console.log('• Memberships & payments');
  const planFor: Record<string, string> = {
    anna: 'INTENSIVE', diana: 'LITE', alex: 'STANDARD', maria: 'LITE', timur: 'BUSINESS', aigerim: 'LITE', nurlan: 'STANDARD', dinara: 'STANDARD',
    ivan: 'LITE', olga: 'STANDARD', asel: 'STANDARD', yerlan: 'BUSINESS', kamila: 'STANDARD', sanzhar: 'LITE', alina: 'INTENSIVE', bekzat: 'STANDARD',
    dariya: 'LITE', adil: 'STANDARD', zarina: 'STANDARD', ruslan: 'LITE', saule: 'LITE', arman: 'STANDARD', ainur: 'INTENSIVE', dmitriy: 'BUSINESS',
    karina: 'STANDARD', maksat: 'STANDARD',
  };
  for (const p of people.filter((x) => x.key.startsWith('member'))) {
    planFor[p.key] = pickOne(['LITE', 'STANDARD', 'STANDARD', 'STANDARD', 'INTENSIVE']);
  }
  // ─── Trial sessions: several newcomers tried one session before buying (a few did not buy) ───
  const trialPurchaseAt: Record<string, DateTime> = {};
  const trialIds: Array<{ key: string; trialId: string; bought: boolean }> = [];
  const trialCandidates = people.filter((p) => p.key.startsWith('member') && p.registerDaysAgo >= 9 && p.registerDaysAgo <= 30).slice(0, 8);
  for (const [index, p] of trialCandidates.entries()) {
    const c = clients[p.key];
    const registeredAt = realNow.minus({ days: p.registerDaysAgo });
    const session = await prisma.session.findFirst({
      where: {
        status: 'SCHEDULED',
        trialsAllowed: true,
        format: 'OFFLINE',
        groupTypeId: { not: G.kids },
        startsAt: { gt: registeredAt.plus({ hours: 20 }).toJSDate(), lt: registeredAt.plus({ days: 4 }).toJSDate() },
      },
      orderBy: { startsAt: 'asc' },
    });
    if (!session) continue;
    const sStart = DateTime.fromJSDate(session.startsAt, { zone: TZ });
    travel(registeredAt.plus({ minutes: 30 }));
    const tb = await bookings
      .book({ sessionId: session.id, clientId: c.id, kind: 'TRIAL', source: 'CLIENT', actor: { userId: c.userId, source: 'CLIENT' }, overrides: { window: true, level: true, capacity: true } })
      .catch(() => null);
    if (!tb) continue;
    const attended = index !== 3; // one newcomer missed the trial
    travel(sStart.plus({ minutes: 95 }));
    await attendance.mark(tb.booking.id, attended ? 'PRESENT' : 'ABSENT', admin);
    const trial = await prisma.trial.findFirst({ where: { bookingId: tb.booking.id } });
    const pay = await prisma.payment.findFirst({ where: { trial: { bookingId: tb.booking.id } } });
    if (pay && attended) await payments.confirm(pay.id, { methodCode: pickOne(['CASH', 'KASPI']) }, admin);
    const bought = attended && index % 4 !== 1; // most attendees buy; some think it over
    if (bought) trialPurchaseAt[p.key] = sStart.plus({ days: 1 }).set({ hour: 12, minute: Math.floor(rand() * 50) });
    else {
      delete planFor[p.key];
      p.activity = 0; // not a member, so they don't book regular sessions
    }
    if (trial) trialIds.push({ key: p.key, trialId: trial.id, bought });
  }

  for (const [key, code] of Object.entries(planFor)) {
    const c = clients[key];
    if (trialPurchaseAt[key]) {
      await buy(c.id, code, trialPurchaseAt[key], pickOne(['KASPI', 'KASPI', 'CASH', 'ONLINE']));
      continue;
    }
    let daysAgo = Math.max(1, c.def.registerDaysAgo - 1 - Math.floor(rand() * 2));
    if (key === 'diana') daysAgo = 33; // expires in 2 days
    if (key === 'maria') daysAgo = 45; // expired 10 days ago
    if (key === 'saule') daysAgo = 34;
    await buy(c.id, code, realNow.minus({ days: daysAgo }).set({ hour: 12, minute: Math.floor(rand() * 50) }), pickOne(['KASPI', 'KASPI', 'CASH', 'ONLINE']));
  }
  await buy(aru.id, 'LITE', realNow.minus({ days: 12 }).set({ hour: 11 }), 'KASPI');
  for (const t of trialIds) {
    const at = trialPurchaseAt[t.key] ?? realNow.minus({ days: clients[t.key].def.registerDaysAgo - 2 });
    travel(at.plus({ hours: 1 }));
    await trials.setOutcome(t.trialId, t.bought ? 'PURCHASED' : 'INTERESTED', t.bought ? undefined : 'Wants to think about the schedule', admin);
  }
  // Tamerlan: STANDARD bought six days ago (the example from the specification).
  const tamerlanPurchase = realNow.minus({ days: 6 }).set({ hour: 12, minute: 5 });
  await buy(clients.tamerlan.id, 'STANDARD', tamerlanPurchase, 'KASPI');

  // ─── Replay sessions: bookings, cancellations, attendance, feedback ───
  console.log('• Replaying five weeks of sessions (bookings, attendance, feedback)…');
  const levelRanks = new Map((await prisma.level.findMany()).map((l) => [l.id, l.rank]));
  const pastSessions = await prisma.session.findMany({
    where: { startsAt: { lt: realNow.minus({ hours: 2 }).toJSDate() }, status: 'SCHEDULED' },
    include: { groupType: true },
    orderBy: { startsAt: 'asc' },
  });
  const regulars = Object.values(clients).filter((c) => c.def.activity > 0 && !['tamerlan', 'madina', 'daniyar', 'aruzhan'].includes(c.def.key));
  const comments = [
    'Great participation today — you explained your ideas clearly.',
    'Good participation today. Try using more complex linking phrases.',
    'Nice progress with past tenses. Keep practising question forms.',
    'Very confident speaking! Work on the pronunciation of "th".',
    'You asked great follow-up questions. Try to speak a bit longer each turn.',
    'Excellent vocabulary on the topic of travel. Keep it up!',
  ];
  let booked = 0;
  for (const s of pastSessions) {
    const sStart = DateTime.fromJSDate(s.startsAt, { zone: TZ });
    const weekday = sStart.weekday;
    const hour = sStart.hour;
    const slot: TimeOfDay = hour < 12 ? 'MORNING' : hour < 17 ? 'AFTERNOON' : 'EVENING';
    const minRank = s.levelMinId ? levelRanks.get(s.levelMinId)! : 0;
    const maxRank = s.levelMaxId ? levelRanks.get(s.levelMaxId)! : 999;
    const categories = s.groupType?.clientCategories ?? [];
    const candidates = shuffle(
      regulars.filter((c) => {
        // Only people who had registered (and bought) before this session could book it.
        if (realNow.minus({ days: c.def.registerDaysAgo - 3 }) > sStart.minus({ days: 1 })) return false;
        const rank = levelRanks.get(L[c.def.level])!;
        if (rank < minRank - 10 || rank > maxRank + 10) return false;
        if (categories.length && !categories.includes(c.def.category ?? 'ADULT')) return false;
        if (s.format === 'ONLINE' && c.def.format !== 'ONLINE') return false;
        if (s.format === 'OFFLINE' && c.def.format === 'ONLINE') return false;
        const likes = (c.def.days ?? []).includes(weekday) && (c.def.times ?? []).includes(slot);
        return likes ? chance(c.def.activity * 0.9) : chance(c.def.activity * 0.12);
      }),
    ).slice(0, 3 + Math.floor(rand() * 4));
    if (s.groupTypeId === G.kids) candidates.splice(0, candidates.length);

    const made: Array<{ bookingId: string; key: string }> = [];
    for (const c of candidates) {
      travel(sStart.minus({ days: 1 + Math.floor(rand() * 3) }).set({ hour: 9 + Math.floor(rand() * 10) }));
      try {
        const res = await bookings.book({ sessionId: s.id, clientId: c.id, kind: 'MEMBERSHIP', source: 'CLIENT', actor: { userId: c.userId, source: 'CLIENT' } });
        made.push({ bookingId: res.booking.id, key: c.def.key });
        booked += 1;
      } catch (error) {
        const code = (error as { code?: string }).code;
        // Out of visits or expired → renew about half of the time (at most once every two weeks).
        const recent = await prisma.membership.count({ where: { clientId: c.id, startsAt: { gt: new Date(clock.now().getTime() - 7 * 86_400_000) } } });
        if ((code === 'BOOKING_NO_VISITS_LEFT' || code === 'BOOKING_NO_ACTIVE_MEMBERSHIP') && !recent && chance(0.8)) {
          await buy(c.id, planFor[c.def.key] ?? 'STANDARD', DateTime.fromJSDate(clock.now(), { zone: TZ }), pickOne(['KASPI', 'CASH', 'ONLINE']));
          try {
            const res = await bookings.book({ sessionId: s.id, clientId: c.id, kind: 'MEMBERSHIP', source: 'CLIENT', actor: { userId: c.userId, source: 'CLIENT' } });
            made.push({ bookingId: res.booking.id, key: c.def.key });
            booked += 1;
          } catch {
            /* still not possible — skip */
          }
        }
      }
    }
    for (const m of made) {
      if (chance(0.07)) {
        travel(sStart.minus({ days: 1 }).set({ hour: 11 }));
        await bookings.cancelByClient(m.bookingId, clients[m.key].id, { id: clients[m.key].userId ?? admin.id } as never, {}).catch(() => undefined);
      } else if (chance(0.04)) {
        travel(sStart.minus({ hours: 3 }));
        await bookings.cancelByClient(m.bookingId, clients[m.key].id, { id: clients[m.key].userId ?? admin.id } as never, { acknowledgeLate: true }).catch(() => undefined);
      }
    }
    // The teacher marks attendance right after the session.
    travel(sStart.plus({ minutes: 95 }));
    const teacherKey = Object.entries(teachers).find(([, t]) => t.id === s.teacherId)?.[0] ?? 'michael';
    const actor = await teacherActor(teacherKey);
    const active = await prisma.booking.findMany({ where: { sessionId: s.id, status: 'BOOKED' } });
    if (active.length) {
      const items = active.map((b) => ({ bookingId: b.id, status: (chance(0.06) ? 'ABSENT' : chance(0.06) ? 'LATE' : 'PRESENT') as 'ABSENT' | 'LATE' | 'PRESENT' }));
      if (chance(0.03)) {
        // Sometimes the teacher forgets — the system finalises attendance automatically.
        travel(sStart.plus({ hours: 5 }));
        await attendance.finalizeDue();
      } else {
        await attendance.markBulk(s.id, items, actor);
        for (const item of items.filter((i) => i.status !== 'ABSENT')) {
          if (chance(0.3)) {
            await feedback.upsert(
              item.bookingId,
              {
                participation: 3 + Math.floor(rand() * 3),
                fluency: 2 + Math.floor(rand() * 4),
                vocabulary: 2 + Math.floor(rand() * 4),
                confidence: 3 + Math.floor(rand() * 3),
                comment: pickOne(comments),
              },
              actor,
            );
          }
        }
      }
    }
  }
  console.log(`  ${pastSessions.length} past sessions, ${booked} bookings`);

  // ─── Tamerlan: the specification example (5 / 8 visits left, next session with Michael at 18:30) ───
  const nextSession = async (teacherKey: string, hour: number, minute: number, after: DateTime) => {
    const candidates = await prisma.session.findMany({
      where: { teacherId: teachers[teacherKey].id, status: 'SCHEDULED', startsAt: { gt: after.toJSDate() } },
      orderBy: { startsAt: 'asc' },
      take: 40,
    });
    return (
      candidates.find((x) => {
        const local = DateTime.fromJSDate(x.startsAt, { zone: TZ });
        return local.hour === hour && local.minute === minute;
      }) ?? null
    );
  };
  const t = clients.tamerlan;
  const tamerlanActor = { id: t.userId!, displayName: 'Tamerlan' } as never;
  const book = (sessionId: string) =>
    bookings.book({ sessionId, clientId: t.id, kind: 'MEMBERSHIP', source: 'CLIENT', actor: { userId: t.userId, source: 'CLIENT' } });
  const cancelledSession = await nextSession('michael', 18, 30, tamerlanPurchase);
  if (cancelledSession) {
    // Booked and cancelled in time → the visit came back.
    const deadline = DateTime.fromJSDate(cancelledSession.startsAt, { zone: TZ }).minus({ days: 1 }).set({ hour: 17 });
    travel(tamerlanPurchase.plus({ hours: 3 }) < deadline ? tamerlanPurchase.plus({ hours: 3 }) : deadline.minus({ hours: 1 }));
    const b1 = await book(cancelledSession.id).catch(() => null);
    if (b1) {
      travel(DateTime.fromJSDate(clock.now(), { zone: TZ }).plus({ hours: 2 }));
      await bookings.cancelByClient(b1.booking.id, t.id, tamerlanActor, {}).catch(() => undefined);
    }
  }
  const kevinSession = await nextSession('kevin', 16, 45, tamerlanPurchase.plus({ days: 1 }));
  const mondaySession = kevinSession ? await nextSession('michael', 18, 30, DateTime.fromJSDate(kevinSession.startsAt, { zone: TZ })) : null;
  for (const [session, teacherKey, comment] of [
    [kevinSession, 'kevin', 'Good participation today. Try using more complex linking phrases.'],
    [mondaySession, 'michael', null],
  ] as const) {
    if (!session || session.startsAt > realNow.minus({ hours: 2 }).toJSDate()) continue;
    const s0 = DateTime.fromJSDate(session.startsAt, { zone: TZ });
    travel(s0.minus({ days: 1 }).set({ hour: 10 }));
    const b = await book(session.id).catch(() => null);
    if (!b) continue;
    travel(s0.plus({ minutes: 95 }));
    const actor = await teacherActor(teacherKey);
    await attendance.mark(b.booking.id, 'PRESENT', actor).catch(() => undefined);
    if (comment) {
      await feedback.upsert(b.booking.id, { participation: 5, fluency: 4, vocabulary: 3, confidence: 4, comment }, actor).catch(() => undefined);
    }
  }
  const nextMichael = await nextSession('michael', 18, 30, realNow);
  if (nextMichael) {
    travel(realNow.minus({ hours: 20 }));
    await book(nextMichael.id).catch(() => undefined);
  }

  // ─── Upcoming bookings (the next week) ───
  console.log('• Upcoming bookings & waitlist');
  travel(realNow.minus({ minutes: 30 }));
  const upcoming = await prisma.session.findMany({
    where: { startsAt: { gt: realNow.toJSDate(), lt: realNow.plus({ days: 7 }).toJSDate() }, status: 'SCHEDULED' },
    include: { groupType: true },
    orderBy: { startsAt: 'asc' },
  });
  for (const s of upcoming) {
    const categories = s.groupType?.clientCategories ?? [];
    const pool = shuffle(regulars.filter((c) => (!categories.length || categories.includes(c.def.category ?? 'ADULT')) && (s.format === 'ONLINE') === (c.def.format === 'ONLINE')));
    for (const c of pool.slice(0, 2 + Math.floor(rand() * 4))) {
      await bookings.book({ sessionId: s.id, clientId: c.id, kind: 'MEMBERSHIP', source: 'CLIENT', actor: { userId: c.userId, source: 'CLIENT' } }).catch(() => undefined);
    }
  }
  // One popular session: full, with two people on the waitlist.
  const popular = upcoming.find((s) => s.teacherId === teachers.haven.id && DateTime.fromJSDate(s.startsAt, { zone: TZ }).hour === 18);
  if (popular) {
    for (const c of shuffle(regulars)) {
      const seats = await prisma.booking.count({ where: { sessionId: popular.id, activeSlot: true } });
      if (seats >= popular.capacity) break;
      await bookings.book({ sessionId: popular.id, clientId: c.id, kind: 'MEMBERSHIP', source: 'CLIENT', actor: { userId: c.userId, source: 'CLIENT' }, overrides: { level: true } }).catch(() => undefined);
    }
    for (const key of ['dinara', 'ainur', 'alina']) {
      await waitlist.join(popular.id, clients[key].id).catch(() => undefined);
    }
  }

  // ─── Trials ───
  console.log('• Trials & CRM');
  // Aruzhan's trial: the first upcoming offline session that suits her level.
  const aruzhanRank = levelRanks.get(L[clients.aruzhan.def.level])!;
  const trialSession =
    upcoming.find(
      (s) =>
        s.trialsAllowed &&
        s.format === 'OFFLINE' &&
        (!s.levelMinId || levelRanks.get(s.levelMinId)! <= aruzhanRank) &&
        (!s.levelMaxId || levelRanks.get(s.levelMaxId)! >= aruzhanRank),
    ) ?? upcoming[0];
  travel(realNow.minus({ days: 1 }).set({ hour: 19 }));
  await bookings.book({ sessionId: trialSession.id, clientId: clients.aruzhan.id, kind: 'TRIAL', source: 'CLIENT', actor: { userId: clients.aruzhan.userId, source: 'CLIENT' } }).catch((e) => console.warn('  trial booking skipped:', (e as Error).message));
  // Daniyar attended a trial last week, has not bought yet (the automation creates a follow-up task).
  const pastTrialSession = pastSessions.filter((s) => s.teacherId === teachers.michael.id).slice(-3)[0];
  if (pastTrialSession) {
    const ps = DateTime.fromJSDate(pastTrialSession.startsAt, { zone: TZ });
    travel(ps.minus({ days: 1 }));
    const tb = await bookings.book({ sessionId: pastTrialSession.id, clientId: clients.daniyar.id, kind: 'TRIAL', source: 'CLIENT', actor: { userId: clients.daniyar.userId, source: 'CLIENT' }, overrides: { window: true, capacity: true, level: true } }).catch(() => null);
    if (tb) {
      travel(ps.plus({ minutes: 100 }));
      await attendance.mark(tb.booking.id, 'PRESENT', admin);
      const pay = await prisma.payment.findFirst({ where: { trial: { bookingId: tb.booking.id } } });
      if (pay) await payments.confirm(pay.id, { methodCode: 'CASH' }, admin);
      travel(ps.plus({ days: 1, hours: 2 }));
      await automations.runDue();
    }
  }
  // Madina chose a membership in the app and will pay at the desk; the admin still has to confirm it.
  travel(realNow.minus({ hours: 3 }));
  await payments.purchase(clients.madina.id, clients.madina.userId!, { planId: planId('STANDARD'), methodCode: 'CASH', acceptOffer: true });
  // Website trial requests and Instagram leads without accounts yet.
  await trials.request({ name: 'Yerkebulan Aliyev', phone: '+77015550201', levelId: L['Pre-Intermediate'], preferredDays: [2, 4], preferredTimes: ['EVENING'], comment: 'Would like to try an evening session', sourceCode: 'WEBSITE' });
  await trials.request({ name: 'Sofia Kim', phone: '+77015550202', levelId: L.Intermediate, preferredDays: [6], preferredTimes: ['AFTERNOON'], sourceCode: 'INSTAGRAM' });
  const leadDefs = [
    { name: 'Aidana Kuanysh', phone: '+77015550301', source: 'INSTAGRAM', stage: 'NEW_LEAD' as const, notes: 'Asked about prices in Instagram DM' },
    { name: 'Roman Belov', phone: '+77015550302', source: 'TIKTOK', stage: 'CONTACTED' as const, notes: 'Sent the schedule on WhatsApp' },
    { name: 'Gulnara Tulegenova', phone: '+77015550303', source: 'WHATSAPP', stage: 'INTERESTED' as const, notes: 'Wants Business Club for her team (5 people)' },
    { name: 'Nikita Orlov', phone: '+77015550304', source: 'ADVERTISEMENT', stage: 'NEW_LEAD' as const, notes: 'Called after seeing the 2GIS listing' },
    { name: 'Leyla Aliyeva', phone: '+77015550305', source: 'REFERRAL', stage: 'LOST' as const, notes: 'Moved to Astana' },
  ];
  const ownerActor = (await authContext.load(owner.id, null)).user!;
  for (const l of leadDefs) {
    const lead = await crm.createLead({ name: l.name, phone: l.phone, sourceId: sources.find((s) => s.code === l.source)?.id, notes: l.notes }, admin);
    if (l.stage !== 'NEW_LEAD') await crm.moveLead(lead.id, l.stage, admin);
  }
  // Tags, tasks, communications
  const vip = await prisma.crmTag.create({ data: { name: 'VIP', color: '#F59E0B' } });
  const corporate = await prisma.crmTag.create({ data: { name: 'Corporate', color: '#0EA5E9' } });
  const attention = await prisma.crmTag.create({ data: { name: 'Needs attention', color: '#EF4444' } });
  await crm.setClientTags(clients.anna.id, [vip.id], admin);
  await crm.setClientTags(clients.alina.id, [vip.id], admin);
  await crm.setClientTags(clients.timur.id, [corporate.id], admin);
  await crm.setClientTags(clients.yerlan.id, [corporate.id], admin);
  await crm.setClientTags(clients.maria.id, [attention.id], admin);
  travel(realNow.minus({ days: 2 }).set({ hour: 11 }));
  await crm.logCommunication({ clientId: clients.maria.id, channel: 'WHATSAPP', direction: 'OUTBOUND', content: 'Your membership expires soon — would you like to continue with STANDARD?' }, admin);
  await crm.logCommunication({ clientId: clients.maria.id, channel: 'WHATSAPP', direction: 'INBOUND', content: 'Thanks! I am travelling this week, I will renew next Monday.' }, admin);
  await crm.createTask({ title: 'Call Maria about renewal next Monday', clientId: clients.maria.id, priority: 'MEDIUM', dueAt: realNow.plus({ days: 4 }).toJSDate().toISOString(), assignedToId: adminUser.id }, admin);
  await crm.createTask({ title: 'Confirm Kaspi payment for Madina', clientId: clients.madina.id, priority: 'HIGH', dueAt: realNow.plus({ hours: 4 }).toJSDate().toISOString(), assignedToId: adminUser.id }, admin);
  await crm.createTask({ title: 'Prepare corporate offer for Gulnara (5 people, Business Club)', priority: 'MEDIUM', dueAt: realNow.plus({ days: 2 }).toJSDate().toISOString() }, ownerActor);
  await prisma.clientActivity.create({ data: { clientId: clients.anna.id, type: 'note', title: 'Prefers evening sessions with Haven. Interested in an IELTS speaking group.', actorId: adminUser.id } });

  // ─── Announcements & broadcasts ───
  console.log('• Announcements, broadcasts, automations');
  travel(realNow.minus({ days: 3 }));
  await announcements.create({ title: 'New Saturday sessions are now available', body: 'We added an Advanced Discussion group on Saturdays at 14:30 with Kevin. Book your seat in the schedule!', buttonLabel: 'See the schedule', buttonUrl: '/schedule', isPinned: true }, admin);
  await announcements.create({ title: 'Welcome our new teacher, James', body: 'James from the USA now leads our online Speaking Club on Tuesdays and Thursdays at 13:00.', buttonLabel: 'Meet the teachers', buttonUrl: '/teachers' }, admin);
  await announcements.create({
    title: 'Business English Club is open',
    body: 'Negotiations, presentations and small talk in English — every Tuesday and Thursday at 18:30 with Dante.',
    audience: { match: 'all', rules: [{ field: 'category', op: 'in', value: ['BUSINESS', 'ADULT'] }] },
  }, admin);
  travel(realNow.minus({ days: 6 }).set({ hour: 12 }));
  const sent = await broadcasts.create({ title: 'New Speaking Club sessions are available', body: 'More evening groups this month! Book early — groups are limited to 7 people.', channels: ['IN_APP', 'PUSH'], kind: 'MARKETING', audience: { match: 'all', rules: [] } }, admin);
  await broadcasts.sendNow(sent.id, admin);
  travel(realNow.minus({ hours: 1 }));
  await broadcasts.create({
    title: 'Last chance: renew with a bonus',
    body: 'Renew your membership this week and get a free trial session for a friend.',
    channels: ['IN_APP', 'PUSH'],
    kind: 'MARKETING',
    segmentId: (await prisma.segment.findUnique({ where: { key: 'EXPIRING_SOON' } }))?.id,
    scheduledAt: realNow.plus({ days: 2 }).set({ hour: 11, minute: 0 }).toJSDate().toISOString(),
  }, admin);

  // ─── Finish: run scheduled automations and lifecycle updates "now" ───
  clock.set(null);
  checkpoints.push({ real: new Date(), sim: new Date() });
  await memberships.expireDue();
  await segments.ensureSystemSegments();
  await automations.scanScheduled();
  await pipeline.refreshLifecycle();
  // Older notifications are read already; keep the last few unread.
  await prisma.notification.updateMany({ where: { createdAt: { lt: new Date(Date.now() - 60_000) } }, data: { readAt: new Date() } });

  console.log('• Aligning timestamps with the simulated timeline');
  await alignTimestamps(prisma, checkpoints);
  await prisma.notification.updateMany({ where: { readAt: { not: null }, createdAt: { gt: realNow.minus({ days: 2 }).toJSDate() } }, data: { readAt: null } });

  const counts = {
    clients: await prisma.client.count(),
    sessions: await prisma.session.count(),
    bookings: await prisma.booking.count(),
    payments: await prisma.payment.count(),
    memberships: await prisma.membership.count(),
    leads: await prisma.lead.count(),
  };
  console.log('\nDemo data ready:', counts);
  console.log('Demo logins are listed at the top of apps/api/prisma/seed.ts and in README.md.');
}

/** Development only: empties every table so the demo can be generated again. */
async function resetDevelopmentData(prisma: { $queryRawUnsafe: <T>(q: string) => Promise<T>; $executeRawUnsafe: (q: string) => Promise<number> }) {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.hostname === 'db';
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' || !local) {
    throw new Error('Refusing to reset: --reset only works on a local development database.');
  }
  const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  console.log(`• Development database ${url.pathname.slice(1)} emptied`);
}

/**
 * Rows got real "created_at" timestamps while the business logic ran on the
 * simulated clock. Shift every created_at/updated_at into the simulated
 * timeline using the checkpoints recorded whenever the clock moved.
 */
async function alignTimestamps(prisma: { $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T>; $executeRawUnsafe: (q: string, ...v: unknown[]) => Promise<number> }, checkpoints: Array<{ real: Date; sim: Date }>) {
  const columns = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name IN ('created_at', 'updated_at') AND table_name <> '_prisma_migrations'`,
  );
  for (let i = 0; i < checkpoints.length; i += 1) {
    const from = checkpoints[i].real;
    const to = checkpoints[i + 1]?.real ?? new Date(Date.now() + 60_000);
    const shiftMs = checkpoints[i].sim.getTime() - from.getTime();
    if (Math.abs(shiftMs) < 1000) continue;
    for (const { table_name, column_name } of columns) {
      await prisma.$executeRawUnsafe(
        `UPDATE "${table_name}" SET "${column_name}" = "${column_name}" + ($1::bigint * interval '1 millisecond')
         WHERE "${column_name}" >= $2 AND "${column_name}" < $3`,
        shiftMs,
        from,
        to,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
