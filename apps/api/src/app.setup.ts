import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { requestContextMiddleware } from './common/request-context';
import type { AppConfig } from './config/app-config';

/** HTTP-level setup shared by main.ts and the e2e/integration test harness. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  const express = app as NestExpressApplication;
  // Correct client IPs behind a reverse proxy / load balancer (rate limits, audit log).
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(requestContextMiddleware);
  app.use(
    helmet({
      // JSON API: CSP is set by the web app; Swagger UI needs inline assets.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Acting-Client', 'X-Client-Platform', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  });
  app.enableShutdownHooks();
}
