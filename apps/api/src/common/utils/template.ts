/**
 * Minimal, safe placeholder rendering for notification templates:
 *   "Hi {{firstName}}! Your session with {{teacher}} starts at {{time}}."
 * Unknown placeholders render as an empty string. No code execution, no HTML.
 */
export type TemplateVars = Record<string, string | number | null | undefined>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function renderTemplate(template: string | null | undefined, vars: TemplateVars): string {
  if (!template) return '';
  return template.replace(PLACEHOLDER, (_, key: string) => {
    const value = vars[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

export function templatePlaceholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1]);
}
