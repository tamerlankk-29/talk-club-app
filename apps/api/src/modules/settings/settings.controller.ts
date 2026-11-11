import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { DomainError } from '../../common/errors/domain-error';
import { isLocale } from '../../common/utils/locale';
import { ChannelRegistry } from '../messaging/channel-registry';
import { IntegrationsDto, LocalizedContentDto } from './dto/settings.dto';
import { AllSettings, SETTINGS_KEYS, SETTINGS_SCHEMAS, SettingsKey } from './settings.schema';
import { SettingsService } from './settings.service';

/**
 * OpenAPI schema generated from the zod settings schema (single source of truth).
 * The schema is widened to ZodTypeAny first: letting TypeScript infer the
 * generic types of the full settings object exhausts the compiler's memory.
 */
const settingsSchema: unknown = z.object(SETTINGS_SCHEMAS as unknown as z.ZodRawShape);
const toJsonSchema = zodToJsonSchema as unknown as (schema: unknown, options: Record<string, unknown>) => Record<string, unknown>;
const SETTINGS_OPENAPI = toJsonSchema(settingsSchema, { target: 'openApi3', $refStrategy: 'none' });

@ApiTags('Admin · Settings')
@Controller('admin/settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly channels: ChannelRegistry,
  ) {}

  @Get()
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'All settings groups (business rules, content, branding)' })
  @ApiOkResponse({ schema: SETTINGS_OPENAPI })
  getAll(): Promise<AllSettings> {
    return this.settings.getAll();
  }

  @Get('integrations')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Configured messaging providers per channel (secrets are never returned)' })
  integrations(): IntegrationsDto {
    return { channels: this.channels.describe() };
  }

  @Get('content/:locale')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Client-app texts as members reading in that language (en, ru, kk) see them' })
  async localizedContent(@Param('locale') locale: string): Promise<LocalizedContentDto> {
    if (!isLocale(locale)) throw new DomainError('NOT_FOUND', { message: 'Unknown language.' });
    return this.settings.localizedContent(locale);
  }

  @Patch(':key')
  @RequirePermissions('settings.manage')
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiOperation({ summary: 'Update one settings group (partial, validated, audited). Returns the updated group.' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  update(@Param('key') key: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    if (!SETTINGS_KEYS.includes(key as SettingsKey)) {
      throw new DomainError('NOT_FOUND', { message: 'Unknown settings group.' });
    }
    return this.settings.update(key as SettingsKey, body, user);
  }
}
