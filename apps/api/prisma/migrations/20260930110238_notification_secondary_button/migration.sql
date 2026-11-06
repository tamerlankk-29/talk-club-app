-- AlterTable
ALTER TABLE "notification_templates" ADD COLUMN     "secondary_button_label" TEXT,
ADD COLUMN     "secondary_button_url" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "secondary_button_label" TEXT,
ADD COLUMN     "secondary_button_url" TEXT;
