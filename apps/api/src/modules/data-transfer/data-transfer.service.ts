import { Injectable } from '@nestjs/common';
import { ClientCategory, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { fullName } from '../../common/utils/names';
import { normalizePhone } from '../../common/utils/phone';
import { localClock, localDate } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/catalog.service';
import { PipelineService, STAGE_LABELS } from '../crm/pipeline.service';
import { ReportsService } from '../reports/reports.service';
import { CsvColumn, pick, readTable, Row, toCsv, toXlsx } from './tabular';

export const EXPORT_DATASETS = ['clients', 'attendance', 'payments', 'memberships', 'bookings', 'leads', 'revenue'] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];
export type ImportKind = 'clients' | 'altegio-clients' | 'altegio-visits' | 'altegio-payments';

export interface ImportResult {
  jobId: string;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

const A = {
  firstName: ['first_name', 'firstname', 'Имя', 'First name', 'name', 'Name', 'Клиент', 'Client', 'ФИО', 'Full name'],
  lastName: ['last_name', 'lastname', 'Фамилия', 'Last name', 'Surname'],
  phone: ['phone', 'Телефон', 'Phone number', 'Номер телефона', 'Мобильный', 'mobile', 'client phone', 'Телефон клиента'],
  email: ['email', 'E-mail', 'Почта', 'Email address'],
  birthDate: ['birth_date', 'birthday', 'Дата рождения', 'Birth date', 'День рождения'],
  notes: ['notes', 'comment', 'Комментарий', 'Примечание', 'Comments'],
  level: ['level', 'Уровень', 'English level'],
  category: ['category', 'Категория клиента', 'client type', 'type'],
  source: ['source', 'Источник', 'Lead source'],
  tags: ['tags', 'Категории', 'Метки', 'labels', 'Теги'],
  lastVisit: ['last_visit', 'Последний визит', 'Last visit', 'Дата последнего визита'],
  visits: ['visits', 'Визиты', 'Кол-во визитов', 'Visit count', 'Количество визитов'],
  spent: ['spent', 'Потрачено', 'Сумма', 'Total spent', 'Оплачено'],
  marketing: ['marketing_consent', 'Согласие на рассылку', 'marketing'],
  date: ['date', 'Дата', 'Дата визита', 'Visit date'],
  time: ['time', 'Время', 'Start time', 'Время начала'],
  staff: ['staff', 'teacher', 'Сотрудник', 'Мастер', 'Преподаватель', 'Specialist'],
  service: ['service', 'Услуга', 'Услуги', 'Session'],
  status: ['status', 'Статус', 'Статус визита', 'Attendance'],
  duration: ['duration', 'Длительность', 'Duration (min)'],
  amount: ['amount', 'Сумма', 'Sum', 'Paid', 'Оплата'],
  method: ['method', 'Способ оплаты', 'Payment method', 'Тип оплаты'],
  description: ['description', 'Назначение', 'Товар', 'Product', 'Абонемент'],
};

function parseDate(value: string, tz: string): DateTime | null {
  if (!value) return null;
  for (const fmt of ['yyyy-MM-dd', 'dd.MM.yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd HH:mm', 'dd.MM.yyyy HH:mm', 'dd.MM.yyyy H:mm']) {
    const dt = DateTime.fromFormat(value.trim(), fmt, { zone: tz });
    if (dt.isValid) return dt;
  }
  const iso = DateTime.fromISO(value.trim(), { zone: tz });
  return iso.isValid ? iso : null;
}

function mapCategory(value: string): ClientCategory | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  if (/(teen|подрост)/.test(v)) return 'TEEN';
  if (/(child|kid|дет|ребен)/.test(v)) return 'CHILD';
  if (/(business|бизнес)/.test(v)) return 'BUSINESS';
  if (/(individual|индивид)/.test(v)) return 'INDIVIDUAL';
  return 'ADULT';
}

/** CSV/XLSX exports and imports (client lists, Altegio migration). */
@Injectable()
export class DataTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly catalog: CatalogService,
    private readonly pipeline: PipelineService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  // ═════════════════ Exports ═════════════════

  async export(dataset: ExportDataset, format: 'csv' | 'xlsx', from: string | undefined, to: string | undefined, actor: AuthUser) {
    const range = await this.reports.range(from, to, 365);
    const tz = range.tz;
    const d = (date: Date | null | undefined) => (date ? localDate(date, tz) : '');
    const dt = (date: Date | null | undefined) => (date ? `${localDate(date, tz)} ${localClock(date, tz)}` : '');
    let rows: unknown[] = [];
    let columns: CsvColumn<any>[] = [];

    switch (dataset) {
      case 'clients': {
        const now = this.clock.now();
        rows = await this.prisma.client.findMany({
          where: { status: { not: 'ANONYMIZED' } },
          include: {
            level: true,
            source: true,
            tags: { include: { tag: true } },
            memberships: { where: { status: 'ACTIVE', expiresAt: { gt: now } }, orderBy: { expiresAt: 'asc' }, take: 1 },
            _count: { select: { bookings: { where: { status: 'ATTENDED' } } } },
          },
          orderBy: { createdAt: 'asc' },
        });
        columns = [
          { header: 'First name', value: (c) => c.firstName },
          { header: 'Last name', value: (c) => c.lastName },
          { header: 'Phone', value: (c) => c.phone },
          { header: 'Email', value: (c) => c.email },
          { header: 'Category', value: (c) => c.category },
          { header: 'Level', value: (c) => c.level?.name },
          { header: 'Source', value: (c) => c.source?.name },
          { header: 'Status', value: (c) => c.status },
          { header: 'Registered', value: (c) => d(c.createdAt) },
          { header: 'Last visit', value: (c) => d(c.lastVisitAt) },
          { header: 'Membership', value: (c) => c.memberships[0]?.planName },
          { header: 'Visits remaining', value: (c) => c.memberships[0]?.visitsRemaining },
          { header: 'Membership expires', value: (c) => d(c.memberships[0]?.expiresAt) },
          { header: 'Total visits', value: (c) => c._count.bookings },
          { header: 'Marketing consent', value: (c) => (c.marketingConsent ? 'yes' : 'no') },
          { header: 'Tags', value: (c) => c.tags.map((t: { tag: { name: string } }) => t.tag.name).join(', ') },
        ];
        break;
      }
      case 'attendance':
      case 'bookings': {
        rows = await this.prisma.booking.findMany({
          where: {
            session: { startsAt: { gte: range.from, lte: range.to } },
            ...(dataset === 'attendance' ? { status: { in: ['ATTENDED', 'NO_SHOW'] } } : {}),
          },
          include: {
            client: { select: { firstName: true, lastName: true, phone: true } },
            attendance: true,
            membership: { select: { planName: true } },
            session: { include: { teacher: { select: { firstName: true, lastName: true } }, groupType: { select: { name: true } }, room: { select: { name: true } } } },
          },
          orderBy: { session: { startsAt: 'asc' } },
        });
        columns = [
          { header: 'Date', value: (b) => d(b.session.startsAt) },
          { header: 'Time', value: (b) => localClock(b.session.startsAt, tz) },
          { header: 'Session', value: (b) => b.session.title ?? b.session.groupType?.name ?? 'Speaking Club' },
          { header: 'Teacher', value: (b) => (b.session.teacher ? fullName(b.session.teacher.firstName, b.session.teacher.lastName) : '') },
          { header: 'Room', value: (b) => b.session.room?.name },
          { header: 'Client', value: (b) => fullName(b.client.firstName, b.client.lastName) },
          { header: 'Phone', value: (b) => b.client.phone },
          { header: 'Booking type', value: (b) => b.kind },
          { header: 'Status', value: (b) => b.status },
          { header: 'Attendance', value: (b) => b.attendance?.status },
          { header: 'Marked by', value: (b) => b.attendance?.method },
          { header: 'Membership', value: (b) => b.membership?.planName },
          { header: 'Booked at', value: (b) => dt(b.bookedAt) },
          { header: 'Cancelled at', value: (b) => dt(b.cancelledAt) },
          { header: 'Visit returned', value: (b) => (b.visitReturned ? 'yes' : 'no') },
        ];
        break;
      }
      case 'payments': {
        rows = await this.prisma.payment.findMany({
          where: { createdAt: { gte: range.from, lte: range.to } },
          include: { client: { select: { firstName: true, lastName: true, phone: true } }, method: true, confirmedBy: { select: { displayName: true } } },
          orderBy: { createdAt: 'asc' },
        });
        columns = [
          { header: 'Created', value: (p) => dt(p.createdAt) },
          { header: 'Paid', value: (p) => dt(p.paidAt) },
          { header: 'Client', value: (p) => fullName(p.client.firstName, p.client.lastName) },
          { header: 'Phone', value: (p) => p.client.phone },
          { header: 'Product', value: (p) => p.productType },
          { header: 'Description', value: (p) => p.description },
          { header: 'Amount (KZT)', value: (p) => p.amount },
          { header: 'Refunded (KZT)', value: (p) => p.refundedAmount },
          { header: 'Status', value: (p) => p.status },
          { header: 'Method', value: (p) => p.method.name },
          { header: 'Reference', value: (p) => p.reference },
          { header: 'Confirmed by', value: (p) => p.confirmedBy?.displayName },
        ];
        break;
      }
      case 'memberships': {
        rows = await this.prisma.membership.findMany({
          where: { createdAt: { gte: range.from, lte: range.to } },
          include: { client: { select: { firstName: true, lastName: true, phone: true } } },
          orderBy: { createdAt: 'asc' },
        });
        columns = [
          { header: 'Client', value: (m) => fullName(m.client.firstName, m.client.lastName) },
          { header: 'Phone', value: (m) => m.client.phone },
          { header: 'Plan', value: (m) => m.planName },
          { header: 'Status', value: (m) => m.status },
          { header: 'Visits', value: (m) => m.visitsTotal },
          { header: 'Visits remaining', value: (m) => m.visitsRemaining },
          { header: 'Start', value: (m) => d(m.startsAt) },
          { header: 'Expires', value: (m) => d(m.expiresAt) },
          { header: 'Price (KZT)', value: (m) => m.price },
          { header: 'Renewal', value: (m) => (m.isRenewal ? 'yes' : 'no') },
        ];
        break;
      }
      case 'leads': {
        rows = await this.prisma.lead.findMany({
          include: { source: true, assignedTo: { select: { displayName: true } } },
          orderBy: { createdAt: 'asc' },
        });
        columns = [
          { header: 'Name', value: (l) => l.name },
          { header: 'Phone', value: (l) => l.phone },
          { header: 'Email', value: (l) => l.email },
          { header: 'Stage', value: (l) => STAGE_LABELS[l.stage as keyof typeof STAGE_LABELS] },
          { header: 'Source', value: (l) => l.source?.name },
          { header: 'Assigned to', value: (l) => l.assignedTo?.displayName },
          { header: 'Created', value: (l) => d(l.createdAt) },
          { header: 'Stage changed', value: (l) => d(l.stageChangedAt) },
          { header: 'Notes', value: (l) => l.notes },
        ];
        break;
      }
      case 'revenue': {
        const report = await this.reports.revenue(range, 'day');
        rows = report.series;
        columns = [
          { header: 'Date', value: (r) => r.period },
          { header: 'Payments', value: (r) => r.count },
          { header: 'Revenue (KZT)', value: (r) => r.revenue },
          { header: 'Refunds (KZT)', value: (r) => r.refunds },
          { header: 'Net (KZT)', value: (r) => r.net },
        ];
        break;
      }
    }
    await this.audit.log({ actor, action: 'data.export', entityType: 'Export', entityId: dataset, newValue: { format, from, to, rows: rows.length } });
    const stamp = DateTime.fromJSDate(this.clock.now(), { zone: tz }).toFormat('yyyyMMdd-HHmm');
    if (format === 'xlsx') {
      return { filename: `talk-club-${dataset}-${stamp}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: await toXlsx(dataset, rows, columns) };
    }
    return { filename: `talk-club-${dataset}-${stamp}.csv`, contentType: 'text/csv; charset=utf-8', body: Buffer.from(toCsv(rows, columns), 'utf8') };
  }

  // ═════════════════ Imports ═════════════════

  async import(kind: ImportKind, file: { buffer: Buffer; originalname: string }, dryRun: boolean, actor: AuthUser): Promise<ImportResult> {
    const rows = await readTable(file.buffer, file.originalname);
    if (!rows.length) throw new DomainError('IMPORT_INVALID_FILE', { message: 'The file has no data rows.' });
    if (rows.length > 20_000) throw new DomainError('IMPORT_INVALID_FILE', { message: 'Please split files larger than 20,000 rows.' });
    const job = await this.prisma.importJob.create({
      data: { source: kind, fileName: file.originalname, dryRun, totalRows: rows.length, createdById: actor.id },
    });
    const result: ImportResult = { jobId: job.id, dryRun, total: rows.length, created: 0, updated: 0, skipped: 0, errors: [] };
    const tz = await this.catalog.defaultTimezone();
    for (const [index, row] of rows.entries()) {
      try {
        const outcome =
          kind === 'altegio-visits'
            ? await this.importVisit(row, tz, dryRun)
            : kind === 'altegio-payments'
              ? await this.importPayment(row, tz, dryRun)
              : await this.importClient(row, tz, dryRun, kind === 'altegio-clients');
        result[outcome] += 1;
      } catch (error) {
        result.skipped += 1;
        if (result.errors.length < 200) result.errors.push({ row: index + 2, message: (error as Error).message.slice(0, 200) });
      }
    }
    await this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        createdCount: result.created,
        updatedCount: result.updated,
        skippedCount: result.skipped,
        errors: result.errors as unknown as Prisma.InputJsonValue,
        finishedAt: this.clock.now(),
      },
    });
    await this.audit.log({ actor, action: 'data.import', entityType: 'ImportJob', entityId: job.id, newValue: { kind, ...result, errors: result.errors.length } });
    return result;
  }

  async jobs() {
    return this.prisma.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  /** Matches by phone, then email — never creates a duplicate client. Existing data is only filled in, not overwritten. */
  private async importClient(row: Row, tz: string, dryRun: boolean, altegio: boolean): Promise<'created' | 'updated' | 'skipped'> {
    let firstName = pick(row, A.firstName);
    let lastName = pick(row, A.lastName);
    if (firstName && !lastName && firstName.includes(' ')) {
      const [first, ...rest] = firstName.split(/\s+/);
      firstName = first;
      lastName = rest.join(' ');
    }
    const rawPhone = pick(row, A.phone);
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    const email = pick(row, A.email).toLowerCase() || null;
    if (!firstName) throw new Error('Missing name');
    if (rawPhone && !phone) throw new Error(`Invalid phone "${rawPhone}"`);
    if (!phone && !email) throw new Error('A phone number or email is required to avoid duplicates');

    const levelName = pick(row, A.level);
    const level = levelName ? await this.prisma.level.findFirst({ where: { name: { equals: levelName, mode: 'insensitive' } } }) : null;
    const sourceName = pick(row, A.source);
    const source = sourceName
      ? await this.prisma.leadSource.findFirst({ where: { OR: [{ code: sourceName.toUpperCase() }, { name: { equals: sourceName, mode: 'insensitive' } }] } })
      : null;
    const birth = parseDate(pick(row, A.birthDate), tz);
    const lastVisit = parseDate(pick(row, A.lastVisit), tz);
    const notesParts = [pick(row, A.notes)];
    if (altegio) {
      const visits = pick(row, A.visits);
      const spent = pick(row, A.spent);
      if (visits || spent) notesParts.push(`Altegio history: ${visits || '?'} visits${spent ? `, spent ${spent}` : ''}.`);
    }
    const notes = notesParts.filter(Boolean).join('\n') || null;
    const tags = pick(row, A.tags)
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const marketing = /^(yes|да|true|1)$/i.test(pick(row, A.marketing));

    const existing =
      (phone ? await this.prisma.client.findUnique({ where: { phone } }) : null) ??
      (email ? await this.prisma.client.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }) : null);
    if (dryRun) return existing ? 'updated' : 'created';

    const client = existing
      ? await this.prisma.client.update({
          where: { id: existing.id },
          data: {
            lastName: existing.lastName ?? (lastName || null),
            email: existing.email ?? email,
            phone: existing.phone ?? phone,
            birthDate: existing.birthDate ?? birth?.toJSDate() ?? null,
            levelId: existing.levelId ?? level?.id ?? null,
            sourceId: existing.sourceId ?? source?.id ?? null,
            notes: existing.notes ? (notes && !existing.notes.includes(notes) ? `${existing.notes}\n${notes}` : existing.notes) : notes,
            lastVisitAt: existing.lastVisitAt ?? lastVisit?.toJSDate() ?? null,
          },
        })
      : await this.prisma.client.create({
          data: {
            firstName,
            lastName: lastName || null,
            phone,
            email,
            birthDate: birth ? new Date(`${birth.toISODate()}T00:00:00Z`) : null,
            category: mapCategory(pick(row, A.category)),
            levelId: level?.id ?? null,
            sourceId: source?.id ?? null,
            notes,
            lastVisitAt: lastVisit?.toJSDate() ?? null,
            marketingConsent: marketing,
            marketingConsentAt: marketing ? this.clock.now() : null,
            externalRef: altegio ? 'altegio' : 'csv',
          },
        });
    for (const name of tags) {
      const tag = await this.prisma.crmTag.upsert({ where: { name }, create: { name }, update: {} });
      await this.prisma.clientTag.upsert({ where: { clientId_tagId: { clientId: client.id, tagId: tag.id } }, create: { clientId: client.id, tagId: tag.id }, update: {} });
    }
    if (!existing) {
      await this.pipeline.ensureLead(client.id);
      await this.prisma.clientActivity.create({ data: { clientId: client.id, type: 'client.imported', title: `Imported from ${altegio ? 'Altegio' : 'CSV'}` } });
    }
    return existing ? 'updated' : 'created';
  }

  /** Historical visit (Altegio record) → past session + booking + attendance, without touching memberships. */
  private async importVisit(row: Row, tz: string, dryRun: boolean): Promise<'created' | 'updated' | 'skipped'> {
    const phone = normalizePhone(pick(row, A.phone));
    if (!phone) throw new Error('Missing or invalid phone');
    const date = pick(row, A.date);
    const time = pick(row, A.time);
    const start = parseDate(time && !date.includes(':') ? `${date} ${time}` : date, tz);
    if (!start) throw new Error(`Invalid date "${date} ${time}"`);
    const statusRaw = pick(row, A.status).toLowerCase();
    const status = /(не приш|no.?show|absent|неявк)/.test(statusRaw)
      ? 'NO_SHOW'
      : /(отмен|cancel)/.test(statusRaw)
        ? 'CANCELLED'
        : 'ATTENDED';
    const duration = Number(pick(row, A.duration)) || 90;
    const staff = pick(row, A.staff);
    if (dryRun) return 'created';

    let client = await this.prisma.client.findUnique({ where: { phone } });
    if (!client) {
      const name = pick(row, A.firstName) || 'Imported client';
      const [first, ...rest] = name.split(/\s+/);
      client = await this.prisma.client.create({ data: { firstName: first, lastName: rest.join(' ') || null, phone, externalRef: 'altegio' } });
      await this.pipeline.ensureLead(client.id);
    }
    let teacherId: string | null = null;
    if (staff) {
      const [first, ...rest] = staff.split(/\s+/);
      const teacher =
        (await this.prisma.teacher.findFirst({ where: { firstName: { equals: first, mode: 'insensitive' } } })) ??
        (await this.prisma.teacher.create({ data: { firstName: first, lastName: rest.join(' ') || null, isActive: false, headline: 'Imported from Altegio' } }));
      teacherId = teacher.id;
    }
    const startsAt = start.toJSDate();
    const program = await this.catalog.defaultProgram();
    const location = await this.catalog.defaultLocation();
    let session = await this.prisma.session.findFirst({ where: { startsAt, teacherId } });
    if (!session) {
      session = await this.prisma.session.create({
        data: {
          programId: program.id,
          locationId: location.id,
          teacherId,
          title: pick(row, A.service) || null,
          startsAt,
          endsAt: new Date(startsAt.getTime() + duration * 60_000),
          capacity: 7,
          attendanceFinalizedAt: this.clock.now(),
        },
      });
    }
    const existing = await this.prisma.booking.findFirst({ where: { sessionId: session.id, clientId: client.id } });
    if (existing) return 'skipped';
    const booking = await this.prisma.booking.create({
      data: {
        sessionId: session.id,
        clientId: client.id,
        kind: 'COMPLIMENTARY',
        source: 'IMPORT',
        status,
        activeSlot: status === 'CANCELLED' ? null : true,
        bookedAt: startsAt,
        cancelledAt: status === 'CANCELLED' ? startsAt : null,
        notes: 'Imported from Altegio',
      },
    });
    if (status !== 'CANCELLED') {
      await this.prisma.attendance.create({
        data: { bookingId: booking.id, sessionId: session.id, clientId: client.id, status: status === 'ATTENDED' ? 'PRESENT' : 'ABSENT', method: 'AUTO', markedAt: startsAt },
      });
    }
    if (status === 'ATTENDED' && (!client.lastVisitAt || client.lastVisitAt < startsAt)) {
      await this.prisma.client.update({ where: { id: client.id }, data: { lastVisitAt: startsAt } });
    }
    return 'created';
  }

  /** Historical payment → PAID payment record (provider "import"); duplicates are skipped. */
  private async importPayment(row: Row, tz: string, dryRun: boolean): Promise<'created' | 'updated' | 'skipped'> {
    const phone = normalizePhone(pick(row, A.phone));
    if (!phone) throw new Error('Missing or invalid phone');
    const amount = Math.round(Number(pick(row, A.amount).replace(/[^\d.,-]/g, '').replace(',', '.')));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount');
    const paid = parseDate(pick(row, A.date), tz);
    if (!paid) throw new Error('Invalid date');
    const client = await this.prisma.client.findUnique({ where: { phone } });
    if (!client) throw new Error(`No client with phone ${phone} — import clients first`);
    const methodRaw = pick(row, A.method).toLowerCase();
    const code = /(kaspi|каспи)/.test(methodRaw) ? 'KASPI' : /(нал|cash)/.test(methodRaw) ? 'CASH' : /(card|карт)/.test(methodRaw) ? 'CARD' : /(перевод|transfer)/.test(methodRaw) ? 'BANK_TRANSFER' : 'OTHER';
    const method = await this.prisma.paymentMethod.findUnique({ where: { code } });
    if (!method) throw new Error(`Payment method ${code} is not configured`);
    const dayStart = paid.startOf('day').toJSDate();
    const dayEnd = paid.endOf('day').toJSDate();
    const duplicate = await this.prisma.payment.findFirst({ where: { clientId: client.id, amount, paidAt: { gte: dayStart, lte: dayEnd } } });
    if (duplicate) return 'skipped';
    if (dryRun) return 'created';
    await this.prisma.payment.create({
      data: {
        clientId: client.id,
        amount,
        productType: 'OTHER',
        description: pick(row, A.description) || 'Imported from Altegio',
        methodId: method.id,
        status: 'PAID',
        provider: 'import',
        paidAt: paid.toJSDate(),
        notes: 'Imported from Altegio',
      },
    });
    return 'created';
  }
}
