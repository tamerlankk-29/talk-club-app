import { ClientCategory, Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_TEMPLATES } from '../modules/notifications/default-templates';
import { syncRbac } from '../modules/rbac/rbac.sync';
import { PRIVACY_TEXT, PUBLIC_OFFER_TEXT, TERMS_TEXT } from './legal-texts';

export interface Baseline {
  programId: string;
  locationId: string;
  rooms: Record<'314' | '315' | '316', string>;
  levels: Record<string, string>;
  groupTypes: Record<'speaking' | 'business' | 'teens' | 'kids', string>;
  plans: Record<'LITE' | 'STANDARD' | 'INTENSIVE' | 'UNLIMITED', string>;
}

export const LEVELS: Array<{ name: string; code: string; rank: number; color: string }> = [
  { name: 'Beginner', code: 'A0', rank: 10, color: '#94A3B8' },
  { name: 'Elementary', code: 'A1', rank: 20, color: '#22C55E' },
  { name: 'Pre-Intermediate', code: 'A2', rank: 30, color: '#14B8A6' },
  { name: 'Intermediate', code: 'B1', rank: 40, color: '#3B82F6' },
  { name: 'Upper-Intermediate', code: 'B2', rank: 50, color: '#8B5CF6' },
  { name: 'Advanced', code: 'C1', rank: 60, color: '#EC4899' },
];

export const WORKING_HOURS = {
  '1': { open: '12:30', close: '20:00' },
  '2': { open: '12:30', close: '20:00' },
  '3': { open: '12:30', close: '20:00' },
  '4': { open: '12:30', close: '20:00' },
  '5': { open: '12:30', close: '20:00' },
  '6': { open: '12:30', close: '20:00' },
  '7': null,
};

/**
 * Idempotent reference data every installation needs: the Talk Club program,
 * the Zheltoksan 118 location, rooms, levels, group types, membership plans,
 * payment methods, lead sources, legal documents, notification templates and
 * roles/permissions. Existing rows are never overwritten.
 */
export async function ensureBaseline(prisma: PrismaClient): Promise<Baseline> {
  await syncRbac(prisma);

  const program = await prisma.program.upsert({
    where: { slug: 'talk-club' },
    create: {
      slug: 'talk-club',
      name: 'Talk Club',
      description: 'English Speaking Club with native speakers',
      color: '#6D28D9',
      sortOrder: 0,
    },
    update: {},
  });

  const location =
    (await prisma.location.findFirst({ orderBy: { createdAt: 'asc' } })) ??
    (await prisma.location.create({
      data: {
        name: 'Talk Club — Zheltoksan',
        address: 'Zheltoksan Street 118',
        addressDetails: 'Offices 314–316',
        city: 'Almaty',
        country: 'Kazakhstan',
        timezone: 'Asia/Almaty',
        phone: '+7 700 000 00 00',
        email: 'hello@talkclub.kz',
        directions:
          'Enter the business centre at Zheltoksan 118 and take the stairs or lift to the 3rd floor. Talk Club is in offices 314–316 — follow the purple signs.',
        workingHours: WORKING_HOURS as Prisma.InputJsonValue,
      },
    }));

  const rooms = {} as Baseline['rooms'];
  for (const [index, code] of (['314', '315', '316'] as const).entries()) {
    const room = await prisma.room.upsert({
      where: { locationId_name: { locationId: location.id, name: `Office ${code}` } },
      create: { locationId: location.id, name: `Office ${code}`, capacity: 8, sortOrder: index },
      update: {},
    });
    rooms[code] = room.id;
  }

  const levels: Record<string, string> = {};
  for (const level of LEVELS) {
    const row = await prisma.level.upsert({
      where: { programId_name: { programId: program.id, name: level.name } },
      create: { programId: program.id, ...level },
      update: {},
    });
    levels[level.name] = row.id;
  }

  const groupTypeDefs: Array<[keyof Baseline['groupTypes'], string, string, ClientCategory[], string]> = [
    ['speaking', 'Speaking Club', 'Conversation practice in small groups with a native speaker.', [], '#6D28D9'],
    ['business', 'Business Club', 'Business English: meetings, negotiations, presentations and networking.', ['ADULT', 'BUSINESS'], '#0EA5E9'],
    ['teens', 'Teens Club', 'Speaking club for teenagers (13–17).', ['TEEN'], '#F97316'],
    ['kids', 'Kids Club', 'Playful English conversation for children.', ['CHILD'], '#22C55E'],
  ];
  const groupTypes = {} as Baseline['groupTypes'];
  for (const [index, [key, name, description, categories, color]] of groupTypeDefs.entries()) {
    const row = await prisma.groupType.upsert({
      where: { programId_name: { programId: program.id, name } },
      create: { programId: program.id, name, description, clientCategories: categories, color, sortOrder: index },
      update: {},
    });
    groupTypes[key] = row.id;
  }

  const planDefs: Array<[keyof Baseline['plans'], number, number, string, boolean]> = [
    ['LITE', 4, 15_000, 'Once a week — a relaxed pace to keep your English alive.', false],
    ['STANDARD', 8, 26_000, 'Twice a week — our most popular rhythm for steady progress.', true],
    ['INTENSIVE', 12, 36_000, 'Three times a week — fast progress in fluency and confidence.', false],
    ['UNLIMITED', 20, 50_000, 'Up to 20 sessions — for those who want to speak English every day.', false],
  ];
  const plans = {} as Baseline['plans'];
  for (const [index, [code, visits, price, description, featured]] of planDefs.entries()) {
    const row = await prisma.membershipPlan.upsert({
      where: { programId_code: { programId: program.id, code } },
      create: {
        programId: program.id,
        code,
        name: code,
        description,
        visits,
        price,
        validityDays: 35,
        isFeatured: featured,
        sortOrder: index,
      },
      update: {},
    });
    plans[code] = row.id;
  }

  const methods: Prisma.PaymentMethodCreateInput[] = [
    {
      code: 'KASPI',
      name: 'Kaspi invoice',
      provider: 'manual',
      // Off for clients until the Kaspi merchant contract is signed; switch on in Settings → Payment methods.
      availableToClients: false,
      sortOrder: 6,
      instructions:
        'We will send a Kaspi invoice to your phone number during working hours. Your membership activates as soon as the invoice is paid.',
    },
    {
      code: 'CASH',
      name: 'Pay at the club desk',
      provider: 'manual',
      availableToClients: true,
      sortOrder: 0,
      instructions: 'Pay by cash or card at the Talk Club reception. The administrator activates your membership right away.',
    },
    { code: 'CARD', name: 'Card (terminal at the desk)', provider: 'manual', sortOrder: 2 },
    { code: 'BANK_TRANSFER', name: 'Bank transfer', provider: 'manual', sortOrder: 3 },
    {
      code: 'ONLINE',
      name: 'Online card payment',
      provider: 'mock_online',
      availableToClients: true,
      sortOrder: 4,
      instructions: 'Pay securely by card. Your membership activates instantly.',
    },
    { code: 'OTHER', name: 'Other', provider: 'manual', sortOrder: 5 },
  ];
  for (const method of methods) {
    await prisma.paymentMethod.upsert({ where: { code: method.code }, create: method, update: {} });
  }

  const sources = [
    ['INSTAGRAM', 'Instagram'],
    ['TIKTOK', 'TikTok'],
    ['WHATSAPP', 'WhatsApp'],
    ['WEBSITE', 'Website / app'],
    ['REFERRAL', 'Referral from a friend'],
    ['WALK_IN', 'Walk-in'],
    ['EXISTING_CLIENT', 'Existing client'],
    ['ADVERTISEMENT', 'Advertisement'],
    ['OTHER', 'Other'],
  ];
  for (const [index, [code, name]] of sources.entries()) {
    await prisma.leadSource.upsert({ where: { code }, create: { code, name, sortOrder: index }, update: {} });
  }

  const legal: Array<['TERMS' | 'PRIVACY_POLICY' | 'PUBLIC_OFFER', string, string]> = [
    ['TERMS', 'Terms of Use', TERMS_TEXT],
    ['PRIVACY_POLICY', 'Privacy Policy', PRIVACY_TEXT],
    ['PUBLIC_OFFER', 'Public Offer', PUBLIC_OFFER_TEXT],
  ];
  for (const [type, title, content] of legal) {
    const exists = await prisma.legalDocument.findFirst({ where: { type } });
    if (!exists) await prisma.legalDocument.create({ data: { type, version: 1, title, content, isCurrent: true } });
  }

  for (const t of DEFAULT_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { key: t.key },
      create: {
        key: t.key,
        name: t.name,
        description: t.description,
        category: t.category,
        title: t.title,
        body: t.body,
        buttonLabel: t.buttonLabel ?? null,
        buttonUrl: t.buttonUrl ?? null,
        secondaryButtonLabel: t.secondaryButtonLabel ?? null,
        secondaryButtonUrl: t.secondaryButtonUrl ?? null,
        channels: t.channels,
      },
      update: {},
    });
  }

  return { programId: program.id, locationId: location.id, rooms, levels, groupTypes, plans };
}
