-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_CREATED';

-- AlterTable
ALTER TABLE "NotificationPref" ADD COLUMN     "suppressEvents" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suppressEveryone" BOOLEAN NOT NULL DEFAULT false;
