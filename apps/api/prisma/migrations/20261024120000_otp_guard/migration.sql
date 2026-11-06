-- Which channel carried each code, so SMS codes can be capped per day; indexes
-- for the daily SMS budget and the per-IP captcha threshold.
ALTER TABLE "otp_codes" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'sms';

-- CreateIndex
CREATE INDEX "otp_codes_channel_created_at_idx" ON "otp_codes"("channel", "created_at");

-- CreateIndex
CREATE INDEX "otp_codes_ip_created_at_idx" ON "otp_codes"("ip", "created_at");
