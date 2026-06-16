-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');

-- CreateEnum
CREATE TYPE "NotifTargetType" AS ENUM ('GUILD', 'CHANNEL');

-- CreateTable
CREATE TABLE "NotificationPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "NotifTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "level" "NotificationLevel" NOT NULL DEFAULT 'ALL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationPref_userId_idx" ON "NotificationPref"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPref_userId_targetType_targetId_key" ON "NotificationPref"("userId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "NotificationPref" ADD CONSTRAINT "NotificationPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
