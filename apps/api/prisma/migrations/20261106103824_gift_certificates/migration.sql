-- CreateEnum
CREATE TYPE "GiftCertificateStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'GIFT_CERTIFICATE';

-- CreateTable
CREATE TABLE "gift_certificates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_name" TEXT NOT NULL,
    "visits" INTEGER NOT NULL,
    "validity_days" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "buyer_client_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "recipient_name" TEXT,
    "message" TEXT,
    "status" "GiftCertificateStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "redeemed_by_client_id" UUID,
    "redeemed_at" TIMESTAMPTZ(3),
    "membership_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gift_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gift_certificates_code_key" ON "gift_certificates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "gift_certificates_payment_id_key" ON "gift_certificates"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_certificates_membership_id_key" ON "gift_certificates"("membership_id");

-- CreateIndex
CREATE INDEX "gift_certificates_status_created_at_idx" ON "gift_certificates"("status", "created_at");

-- CreateIndex
CREATE INDEX "gift_certificates_buyer_client_id_idx" ON "gift_certificates"("buyer_client_id");

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_buyer_client_id_fkey" FOREIGN KEY ("buyer_client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_redeemed_by_client_id_fkey" FOREIGN KEY ("redeemed_by_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_certificates" ADD CONSTRAINT "gift_certificates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
