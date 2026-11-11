import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';
import { builtInText } from '../../common/i18n/built-in-texts';
import type { Locale } from '../../common/utils/locale';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  AllSettings,
  DEFAULT_SETTINGS,
  PUBLIC_SETTINGS_KEYS,
  SETTINGS_KEYS,
  SETTINGS_SCHEMAS,
  SettingsKey,
  SettingsValue,
} from './settings.schema';

const CACHE_TTL_MS = 30_000;

/**
 * Typed, validated key-value settings. Values are deep-merged over code
 * defaults, so adding a new setting never requires a data migration.
 */
@Injectable()
export class SettingsService {
  private cache: { value: AllSettings; loadedAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
    const all = await this.getAll();
    return all[key];
  }

  async getAll(): Promise<AllSettings> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) return this.cache.value;
    const rows = await this.prisma.setting.findMany();
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const merged = {} as Record<SettingsKey, unknown>;
    for (const key of SETTINGS_KEYS) {
      const candidate = mergeDeep(DEFAULT_SETTINGS[key], stored.get(key));
      const parsed = SETTINGS_SCHEMAS[key].safeParse(candidate);
      // A stored value that no longer validates (schema change) falls back to defaults.
      merged[key] = parsed.success ? parsed.data : DEFAULT_SETTINGS[key];
    }
    const value = merged as AllSettings;
    this.cache = { value, loadedAt: Date.now() };
    return value;
  }

  async getPublic(): Promise<Pick<AllSettings, 'club' | 'branding' | 'content'>> {
    const all = await this.getAll();
    return Object.fromEntries(PUBLIC_SETTINGS_KEYS.map((k) => [k, all[k]])) as Pick<
      AllSettings,
      'club' | 'branding' | 'content'
    >;
  }

  /**
   * Client-app texts (About, How it works, Rules, FAQ, contact note) in one language:
   * the version written for that language when there is one, otherwise the main texts
   * with the built-in translation of every starting text that was not edited.
   */
  async localizedContent(locale: Locale): Promise<{ content: SettingsValue<'content'>; customized: boolean }> {
    const all = await this.getAll();
    const own = locale === 'en' ? null : all.contentTranslations[locale];
    if (own) return { content: own, customized: true };
    const tr = (text: string) => builtInText(text, locale);
    const base = all.content;
    return {
      customized: false,
      content: {
        about: tr(base.about),
        rules: tr(base.rules),
        contactNote: tr(base.contactNote),
        howItWorks: base.howItWorks.map((s) => ({ title: tr(s.title), text: tr(s.text) })),
        faq: base.faq.map((f) => ({ question: tr(f.question), answer: tr(f.answer) })),
      },
    };
  }

  async update<K extends SettingsKey>(key: K, patch: unknown, actor: AuthUser | null): Promise<SettingsValue<K>> {
    if (!SETTINGS_KEYS.includes(key)) throw new DomainError('NOT_FOUND', { message: 'Unknown settings group.' });
    const current = await this.get(key);
    const candidate = mergeDeep(current, patch);
    const parsed = SETTINGS_SCHEMAS[key].safeParse(candidate);
    if (!parsed.success) {
      throw new DomainError('SETTINGS_INVALID', {
        details: {
          issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        },
      });
    }
    const value = parsed.data as SettingsValue<K>;
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, updatedById: actor?.id },
      update: { value: value as Prisma.InputJsonValue, updatedById: actor?.id },
    });
    await this.audit.log({
      actor,
      action: 'settings.update',
      entityType: 'Setting',
      entityId: key,
      oldValue: current,
      newValue: value,
    });
    this.invalidate();
    return value;
  }

  invalidate(): void {
    this.cache = null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep merge where arrays and scalars from `patch` replace those in `base`. */
export function mergeDeep<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = key in result ? mergeDeep(result[key], value) : value;
  }
  return result as T;
}
