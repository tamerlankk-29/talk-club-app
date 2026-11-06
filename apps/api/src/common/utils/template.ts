import { isLocalizedText, type LocalizedText } from '../i18n/localized';
import type { Locale } from './locale';

/**
 * Minimal, safe placeholder rendering for notification templates:
 *   "Hi {{firstName}}! Your session with {{teacher}} starts at {{time}}."
 * Unknown placeholders render as an empty string. No code execution, no HTML.
 */
export type TemplateVars = Record<string, string | number | null | undefined | LocalizedText>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function renderTemplate(template: string | null | undefined, vars: TemplateVars, locale: Locale = 'en'): string {
  if (!template) return '';
  return template.replace(PLACEHOLDER, (_, key: string) => {
    const value = vars[key];
    if (value === null || value === undefined) return '';
    return isLocalizedText(value) ? value[locale] : String(value);
  });
}

export function templatePlaceholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1]);
}
