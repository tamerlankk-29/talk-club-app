#!/usr/bin/env node
/**
 * Local development PostgreSQL without Docker.
 *
 * Starts a real PostgreSQL server from the `embedded-postgres` binaries,
 * keeps its data in ./.data/postgres and creates the development and test
 * databases on first run. Stop it with Ctrl+C.
 *
 * If you prefer Docker, use `docker compose up -d db` instead — both listen
 * on the same port with the same credentials, so the .env files work with either.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = resolve(root, '.data', 'postgres');
const port = Number(process.env.PGPORT ?? 5433);
const user = process.env.PGUSER ?? 'talkclub';
const password = process.env.PGPASSWORD ?? 'talkclub';
const databases = (process.env.PGDATABASES ?? 'talkclub,talkclub_test').split(',');

const pg = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
  // Force UTF-8 regardless of the OS locale (Windows would otherwise pick WIN1252,
  // which cannot store Cyrillic/Kazakh names).
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (message) => {
    const text = String(message ?? '').trim();
    if (text) console.error(`[postgres] ${text}`);
  },
});

async function main() {
  const firstRun = !existsSync(resolve(databaseDir, 'PG_VERSION'));
  if (firstRun) {
    console.log(`Initialising PostgreSQL data directory at ${databaseDir} ...`);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  for (const name of databases) {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0`);
      console.log(`Created database ${name}`);
    }
  }
  await client.end();

  console.log(`PostgreSQL is running on localhost:${port} (user "${user}")`);
  console.log(`DATABASE_URL=postgresql://${user}:${password}@localhost:${port}/${databases[0]}`);
  console.log('Press Ctrl+C to stop.');

  const shutdown = async () => {
    console.log('\nStopping PostgreSQL ...');
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async (error) => {
  console.error('Could not start embedded PostgreSQL:', error?.message ?? error);
  try {
    await pg.stop();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
