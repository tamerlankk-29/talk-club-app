import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../app.module';
import { buildOpenApiDocument } from '../swagger';

/**
 * Writes the OpenAPI document to apps/api/openapi.json without starting the
 * server or touching the database (Nest "preview" mode). The web app generates
 * its typed API client from this file (npm run api:types).
 */
async function main(): Promise<void> {
  process.env.JOBS_ENABLED = 'false';
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  app.setGlobalPrefix('api');
  const document = buildOpenApiDocument(app);
  const target = resolve(__dirname, '..', '..', 'openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  const operations = Object.values(document.paths).reduce((n, p) => n + Object.keys(p).length, 0);
  console.log(`OpenAPI written to ${target} (${Object.keys(document.paths).length} paths, ${operations} operations)`);
  await app.close();
}

void main();
