import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Swagger names schemas after their class, so two DTO classes with the same
 * name in different modules silently merge into one schema in openapi.json
 * (and in the generated web types). Keep every exported class name unique.
 */
describe('DTO class names', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
    });
  }

  it('are unique across the API', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const file of files(join(__dirname, '../../src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/export class (\w+)/g)) {
        const name = match[1];
        const other = seen.get(name);
        if (other) duplicates.push(`${name}: ${other} & ${file}`);
        else seen.set(name, file);
      }
    }
    expect(duplicates).toEqual([]);
  });
});
