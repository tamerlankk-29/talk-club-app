-- The refresh token replaced by the last rotation stays valid for a short grace
-- period (see AuthService.refresh), so an aborted refresh response doesn't sign
-- the user out.
ALTER TABLE "auth_sessions" ADD COLUMN     "previous_token_hash" TEXT,
ADD COLUMN     "rotated_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_previous_token_hash_key" ON "auth_sessions"("previous_token_hash");
