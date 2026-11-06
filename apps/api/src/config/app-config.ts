/**
 * Typed application configuration, read once from environment variables.
 * Secrets never leave the API process — nothing here is sent to the frontend
 * except the explicitly public VAPID key.
 */
export type AppEnvironment = 'development' | 'test' | 'staging' | 'production';

export interface AppConfig {
  env: AppEnvironment;
  isProduction: boolean;
  port: number;
  appUrl: string;
  corsOrigins: string[];
  databaseUrl: string;
  auth: {
    secret: string;
    accessTtlMinutes: number;
    refreshTtlDays: number;
    otpDevEcho: boolean;
    cookieSecure: boolean;
    /** Most SMS codes the club sends in 24 hours; protects the SMS budget from bots. */
    smsDailyLimit: number;
    /** Role keys that must use two-factor sign-in (authenticator app). */
    twoFactorRoles: string[];
  };
  captcha: {
    /** Cloudflare Turnstile keys; captcha is off when the secret is not set. */
    turnstileSiteKey: string | null;
    turnstileSecret: string | null;
    /** Code requests per IP and hour allowed before a captcha is required. */
    freeRequestsPerHour: number;
  };
  push: {
    publicKey: string | null;
    privateKey: string | null;
    subject: string;
  };
  notify: {
    email: string;
    sms: string;
    whatsapp: string;
    telegram: string;
    emailFrom: string;
  };
  sms: {
    /** Mobizon API key (Mobizon panel → Settings → API). */
    mobizonApiKey: string | null;
    /** Approved sender name; empty uses Mobizon's default sender. */
    mobizonFrom: string | null;
    mobizonApiUrl: string;
  };
  telegram: {
    /** Bot API token from @BotFather. */
    botToken: string | null;
    /** Bot username without "@", used for t.me links. */
    botUsername: string | null;
    /** Shared secret Telegram sends with every webhook call. */
    webhookSecret: string | null;
  };
  payments: {
    mockOnlineEnabled: boolean;
    webhookSecret: string | null;
  };
  storage: {
    driver: 'local';
    localDir: string;
  };
  jobsEnabled: boolean;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV ?? 'development') as AppEnvironment;
  const isProduction = nodeEnv === 'production' || nodeEnv === 'staging';

  const config: AppConfig = {
    env: nodeEnv,
    isProduction,
    port: int(env.PORT, 4000),
    appUrl: (env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    corsOrigins: (env.CORS_ORIGINS ?? env.APP_URL ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    databaseUrl: env.DATABASE_URL ?? '',
    auth: {
      secret: env.AUTH_SECRET ?? '',
      accessTtlMinutes: int(env.AUTH_ACCESS_TOKEN_TTL_MINUTES, 15),
      refreshTtlDays: int(env.AUTH_REFRESH_TOKEN_TTL_DAYS, 30),
      otpDevEcho: bool(env.AUTH_OTP_DEV_ECHO, false),
      cookieSecure: bool(env.COOKIE_SECURE, isProduction),
      smsDailyLimit: int(env.AUTH_SMS_DAILY_LIMIT, 200),
      twoFactorRoles: (env.AUTH_2FA_REQUIRED_ROLES ?? 'SUPER_ADMIN,ADMIN')
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean),
    },
    captcha: {
      turnstileSiteKey: str(env.TURNSTILE_SITE_KEY),
      turnstileSecret: str(env.TURNSTILE_SECRET_KEY),
      freeRequestsPerHour: int(env.CAPTCHA_FREE_REQUESTS_PER_HOUR, 2),
    },
    push: {
      publicKey: str(env.PUSH_VAPID_PUBLIC_KEY),
      privateKey: str(env.PUSH_VAPID_PRIVATE_KEY),
      subject: env.PUSH_VAPID_SUBJECT ?? 'mailto:hello@talkclub.kz',
    },
    notify: {
      email: env.NOTIFY_EMAIL_PROVIDER ?? 'console',
      sms: str(env.NOTIFY_SMS_PROVIDER) ?? (str(env.MOBIZON_API_KEY) ? 'mobizon' : 'console'),
      whatsapp: env.NOTIFY_WHATSAPP_PROVIDER ?? 'console',
      telegram: str(env.NOTIFY_TELEGRAM_PROVIDER) ?? (str(env.TELEGRAM_BOT_TOKEN) ? 'telegram_bot' : 'console'),
      emailFrom: env.EMAIL_FROM ?? 'Talk Club <hello@talkclub.kz>',
    },
    sms: {
      mobizonApiKey: str(env.MOBIZON_API_KEY),
      mobizonFrom: str(env.MOBIZON_FROM),
      mobizonApiUrl: (str(env.MOBIZON_API_URL) ?? 'https://api.mobizon.kz').replace(/\/$/, ''),
    },
    telegram: {
      botToken: str(env.TELEGRAM_BOT_TOKEN),
      botUsername: str(env.TELEGRAM_BOT_USERNAME)?.replace(/^@/, '') ?? null,
      webhookSecret: str(env.TELEGRAM_WEBHOOK_SECRET),
    },
    payments: {
      mockOnlineEnabled: bool(env.PAYMENT_MOCK_ONLINE_ENABLED, !isProduction),
      webhookSecret: str(env.PAYMENT_WEBHOOK_SECRET),
    },
    storage: {
      driver: 'local',
      localDir: env.STORAGE_LOCAL_DIR ?? './uploads',
    },
    jobsEnabled: bool(env.JOBS_ENABLED, nodeEnv !== 'test'),
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: AppConfig): void {
  const problems: string[] = [];
  if (!config.databaseUrl) problems.push('DATABASE_URL is required');
  if (!config.auth.secret || config.auth.secret === 'change-me') {
    if (config.isProduction) problems.push('AUTH_SECRET must be set to a long random value');
    else config.auth.secret = 'insecure-development-secret-change-me-before-deploying';
  } else if (config.isProduction && config.auth.secret.length < 32) {
    problems.push('AUTH_SECRET must be at least 32 characters');
  }
  if (config.isProduction && config.auth.otpDevEcho) {
    problems.push('AUTH_OTP_DEV_ECHO must be false in staging/production');
  }
  if (config.isProduction && config.payments.mockOnlineEnabled) {
    problems.push('PAYMENT_MOCK_ONLINE_ENABLED must be false in staging/production');
  }
  if (!!config.captcha.turnstileSecret !== !!config.captcha.turnstileSiteKey) {
    problems.push('Set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or neither');
  }
  if (config.notify.sms === 'mobizon' && !config.sms.mobizonApiKey) {
    problems.push('MOBIZON_API_KEY is required when NOTIFY_SMS_PROVIDER=mobizon');
  }
  if (config.telegram.botToken && !config.telegram.botUsername) {
    problems.push('TELEGRAM_BOT_USERNAME is required when TELEGRAM_BOT_TOKEN is set');
  }
  if (config.isProduction && config.telegram.botToken && (config.telegram.webhookSecret?.length ?? 0) < 24) {
    problems.push('TELEGRAM_WEBHOOK_SECRET must be at least 24 random characters when the Telegram bot is enabled');
  }
  if (problems.length) {
    throw new Error(`Invalid configuration:\n - ${problems.join('\n - ')}`);
  }
}
