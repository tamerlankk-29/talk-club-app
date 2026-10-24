import { execSync } from 'node:child_process';
import { config } from 'dotenv';

/**
 * Brings the dedicated test database up to date with the migrations
 * (non-destructive). Each test file then truncates the tables it uses.
 */
export default async function globalSetup(): Promise<void> {
  config({ path: '.env' });
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://talkclub:talkclub@localhost:5433/talkclub_test?schema=public';
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Refusing to run integration tests against a non-test database: ${url}`);
  }
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
