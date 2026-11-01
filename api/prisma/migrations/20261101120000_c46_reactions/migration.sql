-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REACTION';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reactionNotifications" BOOLEAN NOT NULL DEFAULT true;

-- Kişi başı mesaj başına TEK tepki: çiftleri temizle (her (messageId, userId) için en son createdAt kalır,
-- eşitlikte id ile deterministik), sonra eski unique index düşer, yenisi kurulur.
DELETE FROM "MessageReaction"
WHERE "id" IN (
    SELECT "id" FROM (
        SELECT "id",
               ROW_NUMBER() OVER (
                   PARTITION BY "messageId", "userId"
                   ORDER BY "createdAt" DESC, "id" DESC
               ) AS rn
        FROM "MessageReaction"
    ) ranked
    WHERE ranked.rn > 1
);

-- DropIndex
DROP INDEX "MessageReaction_messageId_userId_emoji_key";

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_key" ON "MessageReaction"("messageId", "userId");
