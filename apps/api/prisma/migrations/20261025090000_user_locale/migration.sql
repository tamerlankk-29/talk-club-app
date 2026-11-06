-- Interface and message language per user
ALTER TABLE "users" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
