-- Two-factor authentication with an authenticator app (required for owners and admins).
ALTER TABLE "users" ADD COLUMN     "totp_enabled_at" TIMESTAMPTZ(3),
ADD COLUMN     "totp_failed_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totp_last_step" INTEGER,
ADD COLUMN     "totp_locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "totp_recovery_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totp_secret" TEXT;
