import { config } from 'dotenv';

// Integration tests run against a dedicated database that is wiped between test files.
config({ path: '.env' });
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://talkclub:talkclub@localhost:5433/talkclub_test?schema=public';
process.env.AUTH_SECRET = 'integration-test-secret-integration-test-secret';
process.env.JOBS_ENABLED = 'false';
process.env.AUTH_OTP_DEV_ECHO = 'true';
process.env.PAYMENT_MOCK_ONLINE_ENABLED = 'true';
process.env.PUSH_VAPID_PUBLIC_KEY = '';
process.env.PUSH_VAPID_PRIVATE_KEY = '';
process.env.APP_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
