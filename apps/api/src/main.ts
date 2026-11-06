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
  setupSwagger(app);
  await app.listen(config.port);
  const logger = new Logger('Bootstrap');
  logger.log(`Talk Club API listening on http://localhost:${config.port}/api (${config.env})`);
  logger.log(`API docs: http://localhost:${config.port}/api/docs`);
}

void bootstrap();
