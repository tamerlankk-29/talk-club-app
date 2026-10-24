import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadConfig } from './config/app-config';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app, config);
  // Interactive API docs only outside production/staging unless explicitly enabled.
  const docsEnabled = !config.isProduction || process.env.API_DOCS_ENABLED === 'true';
  if (docsEnabled) setupSwagger(app);
  await app.listen(config.port);
  const logger = new Logger('Bootstrap');
  logger.log(`Talk Club API listening on http://localhost:${config.port}/api (${config.env})`);
  if (docsEnabled) logger.log(`API docs: http://localhost:${config.port}/api/docs`);
}

void bootstrap();
